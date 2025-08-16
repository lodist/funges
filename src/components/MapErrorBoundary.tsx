import React, { Component, type ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  isOnline: boolean;
}

class MapErrorBoundary extends Component<
  Props & { t: (key: string) => string },
  State
> {
  constructor(props: Props & { t: (key: string) => string }) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      isOnline: navigator.onLine,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Map Error Boundary caught an error:', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  componentDidMount() {
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
  }

  componentWillUnmount() {
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
  }

  handleOnline = () => {
    this.setState({ isOnline: true });
  };

  handleOffline = () => {
    this.setState({ isOnline: false });
  };

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    const { children, fallback, t } = this.props;
    const { hasError, error, isOnline } = this.state;

    if (hasError) {
      // Custom fallback UI
      if (fallback) {
        return fallback;
      }

      // Default error UI
      return (
        <Card className='p-6 text-center max-w-md mx-auto'>
          <div className='flex flex-col items-center gap-4'>
            <div className='flex items-center gap-2'>
              <AlertTriangle className='h-8 w-8 text-destructive' />
              {!isOnline && (
                <WifiOff className='h-6 w-6 text-muted-foreground' />
              )}
            </div>

            <div>
              <h3 className='text-lg font-semibold mb-2'>
                {!isOnline ? t('error.offline') : t('error.title')}
              </h3>
              <p className='text-sm text-muted-foreground mb-4'>
                {!isOnline
                  ? t('error.offlineMessage')
                  : error?.message || t('error.generic')}
              </p>
            </div>

            <div className='flex gap-2'>
              <Button onClick={this.handleRetry} variant='outline' size='sm'>
                <RefreshCw className='h-4 w-4 mr-2' />
                {t('error.retry')}
              </Button>
              <Button onClick={this.handleReload} size='sm'>
                {t('error.reload')}
              </Button>
            </div>

            {!isOnline && (
              <div className='flex items-center gap-2 text-xs text-muted-foreground'>
                <Wifi className='h-3 w-3' />
                {t('error.waitingForConnection')}
              </div>
            )}
          </div>
        </Card>
      );
    }

    return children;
  }
}

// Wrapper component to provide translation context
export const MapErrorBoundaryWithTranslation: React.FC<Props> = ({
  children,
  fallback,
}) => {
  const { t } = useTranslation('map');
  return (
    <MapErrorBoundary t={t} fallback={fallback}>
      {children}
    </MapErrorBoundary>
  );
};

export default MapErrorBoundaryWithTranslation;
