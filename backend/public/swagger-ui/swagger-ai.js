// Enhanced Swagger UI assistant and top navigation (alias to swagger-ai-new.js)
(function () {
  try {
    var script = document.createElement('script');
    script.src = '/swagger-ui/swagger-ai-new.js';
    script.onload = function(){ console.log('Loaded swagger-ai-new.js via alias'); };
    document.head.appendChild(script);
  } catch(e) { console.error('Failed to alias swagger-ai-new.js', e); }

})();
// Inject a simple OpenAI assistant UI into Swagger
(function () {
  function ready(fn) {
    if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    try {
      const topbar = document.querySelector('.swagger-ui');
      const container = document.createElement('div');
      container.style.display = 'flex';
      container.style.gap = '8px';
      container.style.padding = '8px';
      container.style.alignItems = 'center';
      container.style.background = '#f7fafc';
      container.style.borderBottom = '1px solid #e2e8f0';

      const input = document.createElement('input');
      input.placeholder = 'Ask the API (powered by OpenAI)...';
      input.style.flex = '1';
      input.style.padding = '8px';
      input.style.border = '1px solid #cbd5e1';

      const btn = document.createElement('button');
      btn.textContent = 'Ask AI';
      btn.style.padding = '8px 12px';
      btn.style.cursor = 'pointer';

      const out = document.createElement('pre');
      out.style.whiteSpace = 'pre-wrap';
      out.style.maxHeight = '240px';
      out.style.overflow = 'auto';
      out.style.margin = '8px';
      out.style.padding = '8px';
      out.style.background = '#fff';
      out.style.border = '1px solid #e2e8f0';

      ready(function () {
        try {
          // create a top-fixed bar to resemble the example
          const bar = document.createElement('div');
          bar.style.position = 'sticky';
          bar.style.top = '0';
          bar.style.zIndex = '9999';
          bar.style.display = 'flex';
          bar.style.alignItems = 'center';
          bar.style.justifyContent = 'space-between';
          bar.style.padding = '8px 12px';
          bar.style.background = '#ffffff';
          bar.style.borderBottom = '1px solid #e2e8f0';

          const left = document.createElement('div');
          left.style.display = 'flex';
          left.style.alignItems = 'center';
          left.style.gap = '12px';

          const title = document.createElement('div');
          title.textContent = document.title || 'API Docs';
          title.style.fontWeight = '600';
          title.style.fontSize = '16px';

          const input = document.createElement('input');
          input.placeholder = 'Ask the API (OpenAI assistant)...';
          input.style.minWidth = '420px';
          input.style.padding = '8px';
          input.style.border = '1px solid #cbd5e1';
          input.style.borderRadius = '6px';

          left.appendChild(title);
          left.appendChild(input);

          const right = document.createElement('div');
          right.style.display = 'flex';
          right.style.alignItems = 'center';
          right.style.gap = '8px';

          const btn = document.createElement('button');
          btn.textContent = 'Ask AI';
          btn.style.padding = '8px 12px';
          btn.style.cursor = 'pointer';
          btn.style.borderRadius = '6px';

          const authBtn = document.createElement('button');
          authBtn.textContent = 'Authorize';
          authBtn.style.padding = '8px 12px';
          authBtn.style.cursor = 'pointer';
          authBtn.style.borderRadius = '6px';

          right.appendChild(btn);
          right.appendChild(authBtn);

          bar.appendChild(left);
          bar.appendChild(right);

          const out = document.createElement('pre');
          out.style.whiteSpace = 'pre-wrap';
          out.style.maxHeight = '260px';
          out.style.overflow = 'auto';
          out.style.margin = '8px';
          out.style.padding = '12px';
          out.style.background = '#f8fafc';
          out.style.border = '1px solid #e2e8f0';
          out.style.borderRadius = '6px';

          btn.addEventListener('click', async () => {
            const q = input.value.trim();
            if (!q) return alert('Please enter a question');
            out.textContent = 'Thinking...';
            try {
              const res = await fetch('/ai/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: q }),
              });
              const j = await res.json();
              out.textContent = j.answer || JSON.stringify(j, null, 2);
            } catch (e) {
              out.textContent = 'Error: ' + e;
            }
          });

          // insert bar before swagger UI
          const el = document.querySelector('.swagger-ui');
          if (el && el.parentNode) {
            el.parentNode.insertBefore(bar, el);
            el.parentNode.insertBefore(out, el);
          } else {
            document.body.insertBefore(bar, document.body.firstChild);
            document.body.insertBefore(out, document.body.firstChild.nextSibling);
          }
        } catch (e) {
          console.error('swagger-ai init failed', e);
        }
      });
