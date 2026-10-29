/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import Layout from './components/Layout';
import { AuthProvider } from './contexts/AuthContext';
import { TenantProvider } from './contexts/TenantContext';

export default function App() {
  return (
    <AuthProvider>
      <TenantProvider>
        <Layout />
      </TenantProvider>
    </AuthProvider>
  );
}
