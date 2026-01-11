/**
 * Client-side attachment preview functionality
 * This script enables preview functionality for attachments in rendered HTML
 */

(function() {
  'use strict';

  // Cache for loaded content
  const contentCache = new Map();

  // File extensions that can be previewed
  const PREVIEWABLE_EXTENSIONS = new Set([
    'txt', 'md', 'markdown', 'html', 'htm', 'css', 'scss', 'less',
    'js', 'jsx', 'ts', 'tsx', 'json', 'xml', 'yaml', 'yml',
    'sh', 'bash', 'py', 'rb', 'java', 'c', 'cpp', 'h', 'cs',
    'php', 'go', 'rs', 'swift', 'kt', 'sql', 'r', 'pl', 'lua'
  ]);

  const MAX_PREVIEW_SIZE = 1024 * 1024; // 1MB
  const MAX_LINES = 100;

  function getFileExtension(filename) {
    return filename.split('.').pop()?.toLowerCase() || '';
  }

  function canPreview(filename, mimetype, size) {
    if (size > MAX_PREVIEW_SIZE) return false;
    
    const ext = getFileExtension(filename);
    if (PREVIEWABLE_EXTENSIONS.has(ext)) return true;
    
    return mimetype?.startsWith('text/') || 
           mimetype?.includes('json') ||
           mimetype?.includes('javascript') ||
           mimetype?.includes('xml');
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function truncateContent(content, maxLines) {
    const lines = content.split('\n');
    if (lines.length <= maxLines) {
      return { content, truncated: false };
    }
    return {
      content: lines.slice(0, maxLines).join('\n'),
      truncated: true
    };
  }

  async function fetchContent(url) {
    // Check cache first
    if (contentCache.has(url)) {
      return contentCache.get(url);
    }

    try {
      const response = await fetch(`${url}/content`);
      if (!response.ok) {
        throw new Error(`Failed to load: ${response.status}`);
      }

      const data = await response.json();
      contentCache.set(url, data.content);
      return data.content;
    } catch (error) {
      throw new Error(error.message || 'Failed to load content');
    }
  }

  function renderPreview(previewEl, content, filename, isTruncated) {
    const ext = getFileExtension(filename);
    
    // Header with file info
    const header = document.createElement('div');
    header.className = 'attachment-preview-header';
    
    const fileInfo = document.createElement('span');
    fileInfo.textContent = `${ext.toUpperCase()} Preview`;
    
    const actions = document.createElement('div');
    actions.className = 'attachment-preview-actions';
    
    const copyBtn = document.createElement('button');
    copyBtn.className = 'attachment-preview-btn';
    copyBtn.textContent = 'Copy';
    copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(content);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
      } catch (err) {
        console.error('Copy failed:', err);
      }
    };
    
    actions.appendChild(copyBtn);
    header.appendChild(fileInfo);
    header.appendChild(actions);
    
    // Content
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = content;
    pre.appendChild(code);
    
    // Truncation notice
    let notice = null;
    if (isTruncated) {
      notice = document.createElement('div');
      notice.className = 'attachment-preview-error';
      notice.textContent = `Showing first ${MAX_LINES} lines. Download the full file to see all content.`;
    }
    
    // Clear and append
    previewEl.innerHTML = '';
    previewEl.appendChild(header);
    previewEl.appendChild(pre);
    if (notice) previewEl.appendChild(notice);
  }

  function showLoading(previewEl) {
    const loading = document.createElement('div');
    loading.className = 'attachment-preview-loading';
    loading.textContent = 'Loading preview...';
    previewEl.innerHTML = '';
    previewEl.appendChild(loading);
  }

  function showError(previewEl, message) {
    const error = document.createElement('div');
    error.className = 'attachment-preview-error';
    error.textContent = message;
    previewEl.innerHTML = '';
    previewEl.appendChild(error);
  }

  async function togglePreview(wrapper, forceShow = null) {
    const preview = wrapper.querySelector('.attachment-preview');
    const toggle = wrapper.querySelector('.attachment-toggle');
    const url = wrapper.dataset.url;
    const filename = wrapper.dataset.filename;
    const mimetype = wrapper.dataset.mimetype;
    const size = parseInt(wrapper.dataset.size || '0', 10);

    const isHidden = preview.style.display === 'none';
    const shouldShow = forceShow !== null ? forceShow : isHidden;

    if (shouldShow) {
      // Check if can preview
      if (!canPreview(filename, mimetype, size)) {
        showError(preview, 'Preview not available for this file type or size.');
        preview.style.display = 'block';
        toggle.querySelector('.attachment-toggle-icon').textContent = '−';
        return;
      }

      // Show preview
      preview.style.display = 'block';
      toggle.querySelector('.attachment-toggle-icon').textContent = '−';

      // Load content if not already loaded
      if (!preview.hasAttribute('data-loaded')) {
        showLoading(preview);
        
        try {
          const content = await fetchContent(url);
          const { content: truncatedContent, truncated } = truncateContent(content, MAX_LINES);
          renderPreview(preview, truncatedContent, filename, truncated);
          preview.setAttribute('data-loaded', 'true');
        } catch (error) {
          showError(preview, error.message);
        }
      }
    } else {
      // Hide preview
      preview.style.display = 'none';
      toggle.querySelector('.attachment-toggle-icon').textContent = '+';
    }
  }

  function initializeAttachment(wrapper) {
    const toggle = wrapper.querySelector('.attachment-toggle');
    const isExpanded = wrapper.dataset.expanded === 'true';

    if (toggle) {
      toggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        togglePreview(wrapper);
      });
    }

    // If initially expanded, load preview
    if (isExpanded) {
      togglePreview(wrapper, true);
    }
  }

  function init() {
    // Find all attachment wrappers
    const attachments = document.querySelectorAll('.attachment-wrapper[data-attachment="true"]');
    attachments.forEach(initializeAttachment);
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Re-initialize on dynamic content changes (for SPAs)
  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) { // Element node
            if (node.classList?.contains('attachment-wrapper')) {
              initializeAttachment(node);
            } else {
              const attachments = node.querySelectorAll?.('.attachment-wrapper[data-attachment="true"]');
              attachments?.forEach(initializeAttachment);
            }
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
})();
