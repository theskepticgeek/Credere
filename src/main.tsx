import React from 'react';
import ReactDOM from 'react-dom/client';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { wagmiConfig } from './config';
import App from './App';
import './styles.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><WagmiProvider config={wagmiConfig}><QueryClientProvider client={queryClient}><App /></QueryClientProvider></WagmiProvider></React.StrictMode>,
);
