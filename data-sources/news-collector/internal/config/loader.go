package config

import "github.com/ilyakaznacheev/cleanenv"

func Load(path string) (*Config, error) {

	var cfg Config

	err := cleanenv.ReadConfig(
		path,
		&cfg,
	)

	if err != nil {
		return nil, err
	}

	return &cfg, nil
}