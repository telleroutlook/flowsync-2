import { ChatMessage, Project, Task, TaskStatus } from '../../types';
import { triggerDownload } from './export';

export const exportChatToHtml = (
  messages: ChatMessage[],
  assistantName: string,
  project?: Project,
  tasks?: Task[]
) => {
  const title = `Chat Export - ${project?.name || 'Project'} - ${new Date().toLocaleDateString()}`;
  
  // Calculate Statistics
  let statsHtml = '';
  if (tasks) {
    const total = tasks.length;
    const todo = tasks.filter(t => t.status === TaskStatus.TODO).length;
    const inProgress = tasks.filter(t => t.status === TaskStatus.IN_PROGRESS).length;
    const done = tasks.filter(t => t.status === TaskStatus.DONE).length;
    const completion = total > 0 ? Math.round((done / total) * 100) : 0;

    statsHtml = `
      <div class="bg-white border border-gray-200 rounded-xl p-6 mb-8 shadow-sm">
        <h2 class="text-lg font-semibold text-gray-900 mb-4">Project Overview</h2>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="p-4 bg-gray-50 rounded-lg">
            <div class="text-sm text-gray-500 mb-1">Total Tasks</div>
            <div class="text-2xl font-bold text-gray-900">${total}</div>
          </div>
          <div class="p-4 bg-blue-50 rounded-lg">
            <div class="text-sm text-blue-600 mb-1">In Progress</div>
            <div class="text-2xl font-bold text-blue-700">${inProgress}</div>
          </div>
          <div class="p-4 bg-green-50 rounded-lg">
            <div class="text-sm text-green-600 mb-1">Completed</div>
            <div class="text-2xl font-bold text-green-700">${done}</div>
          </div>
          <div class="p-4 bg-gray-50 rounded-lg">
            <div class="text-sm text-gray-500 mb-1">Progress</div>
            <div class="text-2xl font-bold text-gray-900">${completion}%</div>
          </div>
        </div>
        ${project?.description ? `<div class="mt-4 text-sm text-gray-600 pt-4 border-t border-gray-100">${project.description}</div>` : ''}
      </div>
    `;
  } else if (project) {
     statsHtml = `
      <div class="bg-white border border-gray-200 rounded-xl p-6 mb-8 shadow-sm">
        <h2 class="text-lg font-semibold text-gray-900 mb-2">${project.name}</h2>
        ${project.description ? `<p class="text-gray-600">${project.description}</p>` : ''}
      </div>
    `;
  }

  const messagesHtml = messages
    .filter(msg => msg.id !== 'welcome')
    .map(msg => {
    const isUser = msg.role === 'user';
    const isSystem = msg.role === 'system';
    
    if (isSystem) {
      return `
        <div class="flex justify-center my-4 w-full">
          <div class="max-w-[85%] text-[10px] font-medium text-gray-500 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200 text-center break-words whitespace-pre-wrap">
            ${msg.text}
          </div>
        </div>
      `;
    }

    const roleLabel = isUser ? 'You' : assistantName;
    const alignClass = isUser ? 'items-end' : 'items-start';
    const bubbleClass = isUser 
      ? 'bg-blue-600 text-white rounded-br-none' 
      : 'bg-white text-gray-900 border border-gray-200 rounded-bl-none';
    const textClass = isUser ? 'text-white/90' : 'text-gray-800';
    const timeClass = isUser ? 'text-blue-100' : 'text-gray-400';

    const attachmentsHtml = (msg.attachments || []).map(att => `
      <div class="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs bg-black/5 mt-2">
        <span>📎</span>
        <span class="truncate font-medium">${att.name}</span>
        <span class="opacity-70">(${Math.round(att.size / 1024)} KB)</span>
      </div>
    `).join('');

    const safeText = msg.text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

    return `
      <div class="flex flex-col w-full mb-6 ${alignClass}">
        <div class="max-w-[92%] px-5 py-4 rounded-2xl text-sm leading-relaxed shadow-sm ${bubbleClass}">
          <div class="markdown-content ${textClass}">${safeText}</div>
          ${attachmentsHtml}
          <div class="text-[10px] mt-2 flex items-center justify-end gap-1 ${timeClass}">
            ${new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • ${roleLabel}
          </div>
        </div>
      </div>
    `;
  }).join('');

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Inter', sans-serif; background-color: #f8fafc; }
    
    .markdown-content p { margin-bottom: 0.75em; }
    .markdown-content p:last-child { margin-bottom: 0; }
    .markdown-content a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
    .markdown-content ul { list-style-type: disc; margin-left: 1.2em; margin-bottom: 0.75em; }
    .markdown-content ol { list-style-type: decimal; margin-left: 1.2em; margin-bottom: 0.75em; }
    .markdown-content code { 
      font-family: monospace; 
      font-size: 0.9em; 
      padding: 0.1em 0.3em; 
      border-radius: 0.25em; 
      background-color: rgba(0,0,0,0.1); 
    }
    .markdown-content pre { 
      background-color: #1e293b; 
      color: #e2e8f0; 
      padding: 1em; 
      border-radius: 0.5em; 
      overflow-x: auto; 
      margin: 0.75em 0; 
    }
    .markdown-content pre code { 
      background-color: transparent; 
      padding: 0; 
      color: inherit; 
    }
    .markdown-content blockquote { 
      border-left: 3px solid currentColor; 
      padding-left: 1em; 
      font-style: italic; 
      opacity: 0.8; 
    }
    .markdown-content table { 
      width: 100%; 
      border-collapse: collapse; 
      margin: 1em 0; 
      font-size: 0.9em; 
    }
    .markdown-content th, .markdown-content td { 
      border: 1px solid rgba(0,0,0,0.1); 
      padding: 0.5em; 
      text-align: left; 
    }
    .markdown-content th { background-color: rgba(0,0,0,0.05); }
    
    .bg-blue-600 .markdown-content code { background-color: rgba(255,255,255,0.2); }
    .bg-blue-600 .markdown-content pre { background-color: rgba(0,0,0,0.2); }
    .bg-blue-600 .markdown-content th, .bg-blue-600 .markdown-content td { border-color: rgba(255,255,255,0.2); }
    .bg-blue-600 .markdown-content th { background-color: rgba(255,255,255,0.1); }
  </style>
</head>
<body class="min-h-screen py-8 px-4 sm:px-8">
  <div class="max-w-3xl mx-auto">
    <header class="mb-8 text-center">
      <h1 class="text-2xl font-bold text-gray-900">${project?.name || 'Chat Export'}</h1>
      <p class="text-sm text-gray-500 mt-1">${new Date().toLocaleString()}</p>
    </header>

    ${statsHtml}

    <div class="flex flex-col gap-2">
      ${messagesHtml}
    </div>

    <footer class="mt-12 text-center text-xs text-gray-400">
      <p>&copy; ${new Date().getFullYear()} FlowSync. All rights reserved.</p>
    </footer>
  </div>

  <script>
    document.addEventListener('DOMContentLoaded', () => {
      marked.use({ breaks: true, gfm: true });
      document.querySelectorAll('.markdown-content').forEach(el => {
        const txt = document.createElement('textarea');
        txt.innerHTML = el.innerHTML;
        el.innerHTML = marked.parse(txt.value);
      });
    });
  </script>
</body>
</html>
  `;

  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const idPrefix = project?.id ? `${project.id}-` : '';
  const namePart = project?.name ? makeSafeFileName(project.name) : 'project';
  const datePart = new Date().toISOString().slice(0, 10);
  triggerDownload(blob, `chat-export-${idPrefix}${namePart}-${datePart}.html`);
};

function makeSafeFileName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

