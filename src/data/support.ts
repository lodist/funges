import { Bitcoin, Coins, Coffee } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface SupportMethod {
  id: string;
  nameKey: string;
  descriptionKey: string;
  icon: React.ComponentType<{ className?: string }>;
  url?: string;
  address?: string;
  type: 'crypto' | 'platform' | 'donation';
  color?: string;
}

export interface SupportMethodWithTranslations
  extends Omit<SupportMethod, 'nameKey' | 'descriptionKey'> {
  name: string;
  description: string;
}

// Base support data without translations
export const SUPPORT_METHODS: SupportMethod[] = [
  {
    id: 'bitcoin',
    nameKey: 'bitcoin.name',
    descriptionKey: 'bitcoin.description',
    icon: Bitcoin,
    address: 'bc1q0j9yf0w4a5zp45u4lsk0xjq6gfefxcuhsvy2p0',
    type: 'crypto',
    color: '#f7931a',
  },
  {
    id: 'ethereum',
    nameKey: 'ethereum.name',
    descriptionKey: 'ethereum.description',
    icon: Coins,
    address: '0xa8134D63F689b08ab227EE935bB43ba5526f9D4C',
    type: 'crypto',
    color: '#627eea',
  },
  {
    id: 'iota',
    nameKey: 'iota.name',
    descriptionKey: 'iota.description',
    icon: Coins,
    address: 'atoi1qzt0nhsf38nh6rs4p6zs5knqp6psgha9wsv74uajqgjmwc75ugupx3y7x0r',
    type: 'crypto',
    color: '#131f37',
  },
  {
    id: 'buymeacoffee',
    nameKey: 'buymeacoffee.name',
    descriptionKey: 'buymeacoffee.description',
    icon: Coffee,
    url: 'https://buymeacoffee.com/lorisdisteq',
    type: 'platform',
    color: '#ffdd00',
  },
];

// Hook for React components
export const useSupportMethods = (): SupportMethodWithTranslations[] => {
  const { t } = useTranslation('support');

  return SUPPORT_METHODS.map(method => ({
    ...method,
    name: t(method.nameKey),
    description: t(method.descriptionKey),
  }));
};

// Utility functions for non-React usage
export const getSupportMethodById = (id: string): SupportMethod | undefined => {
  return SUPPORT_METHODS.find(method => method.id === id);
};

export const getSupportMethodsByType = (
  type: SupportMethod['type']
): SupportMethod[] => {
  return SUPPORT_METHODS.filter(method => method.type === type);
};

export const getAllSupportMethods = (): SupportMethod[] => {
  return SUPPORT_METHODS;
};
