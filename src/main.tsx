import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { sqliteService } from './services/sqliteStorage.ts';
import { toUserErrorMessage } from './utils/userFeedback.ts';

async function bootstrap() {
  await sqliteService.initialize();
  createRoot(document.getElementById('root')!).render(<App />);
}

void bootstrap().catch((error: unknown) => {
  console.error('[RestoFlow startup failed]', error);
  createRoot(document.getElementById('root')!).render(
    <main className="min-h-screen bg-slate-950 px-5 flex items-center justify-center text-slate-900">
      <section role="alertdialog" aria-modal="true" aria-labelledby="startup-error-title" className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-lg font-black text-rose-600">!</div>
          <div>
            <h1 id="startup-error-title" className="text-lg font-black">RestoFlow could not start</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">{toUserErrorMessage(error, 'The local data service could not be started. Close the application and open it again. If the problem continues, restore a verified backup or contact your administrator.')}</p>
          </div>
        </div>
        <p className="mt-6 text-xs text-slate-500">Your data has not been changed by this startup attempt.</p>
      </section>
    </main>
  );
});
