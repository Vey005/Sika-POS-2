import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import SplashScreen from './components/SplashScreen.tsx';
import './index.css';
import './responsive.css';
import './android.css';

function Root() {
  const [splashDone, setSplashDone] = useState(false);
  return (
    <>
      {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
      <App />
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
