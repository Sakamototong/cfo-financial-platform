// Enhanced Swagger UI assistant and top navigation to match provided design
(function () {
  function ready(fn) {
    if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    try {
      // --- Top green search bar (doc loader) ---
      const topSearch = document.createElement('div');
      topSearch.style.width = '100%';
      topSearch.style.background = '#1faa3a';
      topSearch.style.padding = '8px 14px';
      topSearch.style.boxSizing = 'border-box';
      topSearch.style.position = 'sticky';
      topSearch.style.top = '0';
      topSearch.style.zIndex = '10000';
      topSearch.style.display = 'flex';
      topSearch.style.alignItems = 'center';
      topSearch.style.gap = '8px';

      const logo = document.createElement('div');
      logo.textContent = 'Swagger';
      logo.style.color = '#fff';
      logo.style.fontWeight = '700';
      logo.style.marginRight = '8px';

      const docInput = document.createElement('input');
      docInput.type = 'text';
      docInput.value = 'doc.json';
      docInput.style.flex = '1';
      docInput.style.padding = '8px 12px';
      docInput.style.border = 'none';
      docInput.style.borderRadius = '4px';
      docInput.style.maxWidth = '920px';

      const exploreBtn = document.createElement('button');
      exploreBtn.textContent = 'Explore';
      exploreBtn.style.background = '#2fa84f';
      exploreBtn.style.color = '#fff';
      exploreBtn.style.border = 'none';
      exploreBtn.style.padding = '8px 14px';
      exploreBtn.style.borderRadius = '4px';
      exploreBtn.style.cursor = 'pointer';

      exploreBtn.addEventListener('click', () => {
        const urlBox = document.querySelector('.swagger-ui .download-url-input') || document.querySelector('input[type="url"]');
        if (urlBox) {
          urlBox.value = docInput.value;
          const evt = new Event('change', { bubbles: true });
          urlBox.dispatchEvent(evt);
          const explore = document.querySelector('.swagger-ui button.btn.execute');
          if (explore) explore.click();
        }
      });

      topSearch.appendChild(logo);
      topSearch.appendChild(docInput);
      topSearch.appendChild(exploreBtn);

      // --- Main white header with title + assistant on right ---
      const headerBar = document.createElement('div');
      headerBar.style.width = '100%';
      headerBar.style.background = '#fff';
      headerBar.style.padding = '18px 24px';
      headerBar.style.boxSizing = 'border-box';
      headerBar.style.borderBottom = '1px solid #eee';
      headerBar.style.display = 'flex';
      headerBar.style.alignItems = 'center';
      headerBar.style.justifyContent = 'space-between';
      headerBar.style.gap = '16px';

      const titleWrap = document.createElement('div');
      titleWrap.style.display = 'flex';
      titleWrap.style.flexDirection = 'column';

      const title = document.createElement('div');
      title.textContent = document.title || 'API Documentation';
      title.style.fontSize = '28px';
      title.style.fontWeight = '700';
      title.style.color = '#222';

      const subtitle = document.createElement('div');
      subtitle.textContent = 'Backend API for Project — REST and GraphQL';
      subtitle.style.fontSize = '12px';
      subtitle.style.color = '#666';
      subtitle.style.marginTop = '6px';

      titleWrap.appendChild(title);
      titleWrap.appendChild(subtitle);

      // assistant controls
      const assistantWrap = document.createElement('div');
      assistantWrap.style.display = 'flex';
      assistantWrap.style.alignItems = 'center';
      assistantWrap.style.gap = '8px';

      const assistantInput = document.createElement('input');
      assistantInput.placeholder = 'Ask the API (OpenAI assistant)...';
      assistantInput.style.padding = '8px 12px';
      assistantInput.style.border = '1px solid #ddd';
      assistantInput.style.borderRadius = '6px';
      assistantInput.style.minWidth = '420px';

      const askBtn = document.createElement('button');
      askBtn.textContent = 'Ask AI';
      askBtn.style.background = '#2fa84f';
      askBtn.style.color = '#fff';
      askBtn.style.border = 'none';
      askBtn.style.padding = '8px 12px';
      askBtn.style.borderRadius = '6px';
      askBtn.style.cursor = 'pointer';

      const authBtn = document.createElement('button');
      authBtn.textContent = 'Authorize';
      authBtn.className = 'authorize-btn';
      authBtn.style.background = '#fff';
      authBtn.style.border = '1px solid #cfead6';
      authBtn.style.color = '#2fa84f';
      authBtn.style.padding = '8px 12px';
      authBtn.style.borderRadius = '6px';
      authBtn.style.cursor = 'pointer';

      assistantWrap.appendChild(assistantInput);
      assistantWrap.appendChild(askBtn);
      assistantWrap.appendChild(authBtn);

      headerBar.appendChild(titleWrap);
      headerBar.appendChild(assistantWrap);

      // --- Output area (chat-like) ---
      const out = document.createElement('div');
      out.style.background = '#fff';
      out.style.border = '1px solid #eee';
      out.style.padding = '12px';
      out.style.margin = '12px 24px';
      out.style.borderRadius = '6px';
      out.style.maxHeight = '280px';
      out.style.overflow = 'auto';
      out.id = 'swagger-ai-output';

      // ask button behavior
      askBtn.addEventListener('click', async () => {
        const q = assistantInput.value.trim();
        if (!q) return alert('Please enter a question');
        out.textContent = 'Thinking...';
        try {
          const res = await fetch('/ai/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ q }),
          });
          const j = await res.json();
          out.textContent = j.answer || JSON.stringify(j, null, 2);
        } catch (e) {
          out.textContent = 'Error: ' + e;
        }
      });

      // insert bars before the swagger UI element
      const target = document.querySelector('.swagger-ui') || document.body.firstChild;
      if (target && target.parentNode) {
        target.parentNode.insertBefore(topSearch, target);
        target.parentNode.insertBefore(headerBar, target);
        target.parentNode.insertBefore(out, target);
      } else {
        document.body.insertBefore(topSearch, document.body.firstChild);
        document.body.insertBefore(headerBar, document.body.firstChild.nextSibling);
        document.body.insertBefore(out, document.body.firstChild.nextSibling.nextSibling);
      }

      // wire authorize button to open swagger authorize modal if present
      authBtn.addEventListener('click', () => {
        const auth = document.querySelector('.auth-wrapper .authorize');
        if (auth) auth.click();
        const authorizeBox = document.querySelector('.auth-container');
        if (authorizeBox) authorizeBox.style.display = 'block';
      });

    } catch (e) {
      console.error('swagger-ai init failed', e);
    }
  });

})();
