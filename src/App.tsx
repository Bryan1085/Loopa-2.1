/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, Suspense } from 'react';

const LoopaApp = lazy(() => import('./loopa/App'));

function LoadingScreen() {
  return <div className="loopa-loading" aria-label="Cargando LOOPA" />;
}

export default function App() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <LoopaApp />
    </Suspense>
  );
}
