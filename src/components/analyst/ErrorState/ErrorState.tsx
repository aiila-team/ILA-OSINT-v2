import React from 'react';
import { Button } from '@carbon/react';
import { WarningAlt } from '@carbon/icons-react';
import styles from './ErrorState.module.scss';

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Retry',
  className = '',
}) => {
  return (
    <div className={`${styles.errorState} ${className}`.trim()}>
      <div className={styles.iconWrap} aria-hidden="true">
        <WarningAlt size={32} />
      </div>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.message}>{message}</p>
      {onRetry && (
        <Button
          kind="secondary"
          size="sm"
          onClick={onRetry}
          className={styles.retryButton}
        >
          {retryLabel}
        </Button>
      )}
    </div>
  );
};

export default ErrorState;
