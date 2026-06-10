package scraper

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/MythreshMukkara/new-collector/internal/config"
	"github.com/MythreshMukkara/new-collector/internal/domain"
	"github.com/PuerkitoBio/goquery"
	readability "github.com/go-shiori/go-readability"
	"github.com/gocolly/colly/v2"
)

type CollyScraper struct {
	cfg config.ScraperConfig
}

func New(cfg config.ScraperConfig) *CollyScraper {
	return &CollyScraper{
		cfg: cfg,
	}
}

// Extract visits the page URL, parses OpenGraph and standard meta fields, and extracts cleaned body content.
// It prioritizes publisher-specific selectors, falling back to go-shiori/go-readability if needed.
func (s *CollyScraper) Extract(ctx context.Context, articleURL string, source domain.ArticleSource) (*domain.ScrapedData, error) {
	if articleURL == "" {
		return nil, fmt.Errorf("article URL is empty")
	}

	publisherLower := strings.ToLower(source.Publisher)
	if strings.Contains(publisherLower, "eenadu") {
		client := &http.Client{Timeout: s.cfg.Timeout}
		return ExtractEenaduArticle(ctx, client, articleURL)
	}
	if strings.Contains(publisherLower, "tv9") {
		client := &http.Client{Timeout: s.cfg.Timeout}
		return ExtractTV9Article(ctx, client, articleURL)
	}

	c := colly.NewCollector(
		colly.UserAgent(s.cfg.UserAgent),
		colly.MaxDepth(1),
		colly.IgnoreRobotsTxt(),
	)

	// Configure http.Client timeout & redirect handling
	client := &http.Client{
		Timeout: s.cfg.Timeout,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= s.cfg.MaxRedirects {
				return fmt.Errorf("stopped after %d redirects", s.cfg.MaxRedirects)
			}
			return nil
		},
	}
	c.SetClient(client)

	scraped := &domain.ScrapedData{}
	var htmlBytes []byte

	// Abort request if context is cancelled
	c.OnRequest(func(r *colly.Request) {
		if ctx.Err() != nil {
			r.Abort()
		}
	})

	// Capture raw HTML response body
	c.OnResponse(func(r *colly.Response) {
		htmlBytes = r.Body
	})

	// Visit url
	err := c.Visit(articleURL)
	if err != nil {
		return nil, fmt.Errorf("scraper failed to visit: %w", err)
	}

	if len(htmlBytes) == 0 {
		return nil, fmt.Errorf("failed to retrieve page content")
	}

	// Parse HTML document using goquery to extract standard meta tags
	doc, err := goquery.NewDocumentFromReader(bytes.NewReader(htmlBytes))
	if err != nil {
		return nil, fmt.Errorf("failed to parse HTML: %w", err)
	}

	// 1. Extract metadata from OpenGraph and standard HTML headers
	scraped.Title = cleanText(doc.Find("meta[property='og:title']").AttrOr("content", ""))
	if scraped.Title == "" {
		scraped.Title = cleanText(doc.Find("meta[name='twitter:title']").AttrOr("content", ""))
	}
	if scraped.Title == "" {
		scraped.Title = cleanText(doc.Find("h1").First().Text())
	}
	if scraped.Title == "" {
		scraped.Title = cleanText(doc.Find("title").First().Text())
	}

	scraped.Summary = cleanText(doc.Find("meta[property='og:description']").AttrOr("content", ""))
	if scraped.Summary == "" {
		scraped.Summary = cleanText(doc.Find("meta[name='description']").AttrOr("content", ""))
	}

	pubTime := cleanText(doc.Find("meta[property='article:published_time']").AttrOr("content", ""))
	if pubTime == "" {
		pubTime = cleanText(doc.Find("meta[name='publish-date']").AttrOr("content", ""))
	}
	if pubTime == "" {
		pubTime = cleanText(doc.Find("time").First().AttrOr("datetime", ""))
	}
	scraped.PublishedAt = pubTime

	author := cleanText(doc.Find("meta[name='author']").AttrOr("content", ""))
	if author == "" {
		author = cleanText(doc.Find("meta[property='article:author']").AttrOr("content", ""))
	}
	if author != "" {
		scraped.Authors = append(scraped.Authors, author)
	}

	img := cleanText(doc.Find("meta[property='og:image']").AttrOr("content", ""))
	if img != "" {
		scraped.ImageURLs = append(scraped.ImageURLs, img)
	}

	// 2. Body content extraction

	// Option A: Try custom body selector first (defined in feeds.yaml)
	var bodySelector string
	if source.Selectors != nil && source.Selectors.BodySelector != "" {
		bodySelector = source.Selectors.BodySelector
	}

	if bodySelector != "" {
		// Clean unwanted child elements from matching containers before extracting text
		removeSelectors := []string{
			"script", "style", "noscript", "iframe", "header", "footer", "nav", "aside",
			".ads", ".advertisement", ".social-share", ".comments", ".newsletter-signup",
			"#footer", "#header", "#nav", ".cookie-consent", ".promo",
		}
		if source.Selectors != nil && len(source.Selectors.RemoveSelectors) > 0 {
			removeSelectors = append(removeSelectors, source.Selectors.RemoveSelectors...)
		}

		// Clone the document to safely prune elements without altering original structure
		bodyDoc := doc.Clone()
		for _, remSel := range removeSelectors {
			if strings.TrimSpace(remSel) != "" {
				bodyDoc.Find(remSel).Remove()
			}
		}

		selectors := strings.Split(bodySelector, ",")
		for _, sel := range selectors {
			sel = strings.TrimSpace(sel)
			if sel == "" {
				continue
			}
			match := bodyDoc.Find(sel)
			if match.Length() > 0 {
				scraped.Content = cleanText(match.Text())
				if len(scraped.Content) > 150 {
					break
				}
			}
		}
	}

	// Option B: Fallback to go-shiori/go-readability if custom selector yields empty body content
	if scraped.Content == "" {
		parsedURL, err := url.Parse(articleURL)
		if err != nil {
			return nil, fmt.Errorf("failed to parse article URL for readability: %w", err)
		}

		readabilityDoc, err := readability.FromReader(bytes.NewReader(htmlBytes), parsedURL)
		if err == nil {
			scraped.Content = cleanText(readabilityDoc.TextContent)
			// Use readability title / summary as secondary fallback if still missing
			if scraped.Title == "" && readabilityDoc.Title != "" {
				scraped.Title = cleanText(readabilityDoc.Title)
			}
			if scraped.Summary == "" && readabilityDoc.Excerpt != "" {
				scraped.Summary = cleanText(readabilityDoc.Excerpt)
			}
		}
	}

	if scraped.Content == "" {
		return nil, fmt.Errorf("failed to extract meaningful text content")
	}

	return scraped, nil
}

// cleanText strips redundant space characters and trims input.
func cleanText(in string) string {
	lines := strings.Split(in, "\n")
	var cleaned []string
	for _, l := range lines {
		l = strings.TrimSpace(l)
		if l != "" {
			cleaned = append(cleaned, l)
		}
	}
	return strings.Join(cleaned, "\n")
}
