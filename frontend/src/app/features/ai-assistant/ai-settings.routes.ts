import { Routes } from '@angular/router';
import { AiAssistantRepository } from './data/ai-assistant.repository';
import { HttpAiAssistantRepository } from './data/http-ai-assistant.repository';

export default [
  {
    path: '',
    providers: [{ provide: AiAssistantRepository, useClass: HttpAiAssistantRepository }],
    children: [
      {
        path: '',
        loadComponent: () => import('./ai-settings.page').then((m) => m.AiSettingsPage),
      },
    ],
  },
] satisfies Routes;
