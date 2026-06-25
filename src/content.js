(function () {
  'use strict';

  // Allowed query parameters for clean URL structure
  const ALLOWED_PARAMS = new Set(['q', 'udm', 'tbm', 'tbs', 'start', 'num']);

  // Clean URL parameters by removing non-whitelisted keys and hash anchors
  function cleanUrlParams(urlObj) {
    let changed = false;
    const keysToDelete = [];
    
    // Scan all query parameters present on the URL
    for (const key of urlObj.searchParams.keys()) {
      if (!ALLOWED_PARAMS.has(key)) {
        keysToDelete.push(key);
        changed = true;
      }
    }
    
    // Delete non-whitelisted parameters
    keysToDelete.forEach(key => {
      urlObj.searchParams.delete(key);
    });

    // Remove hash/anchor tags (e.g., #ip=1)
    if (urlObj.hash) {
      urlObj.hash = '';
      changed = true;
    }

    return { url: urlObj, changed };
  }

  // Clean all links present in the DOM (such as navigation tabs) to be clean before user clicks them
  function cleanDOMSearchLinks() {
    // Clean main search links, travel (flights) links, and finance links in the DOM
    document.querySelectorAll('a[href*="/search"], a[href*="/travel/"], a[href*="/finance"]').forEach(link => {
      try {
        const linkUrl = new URL(link.href, window.location.origin);
        
        // Only clean if the link path matches search, travel, or finance pages
        const isTargetLink = linkUrl.pathname === '/search' || 
                             linkUrl.pathname.startsWith('/travel/') || 
                             linkUrl.pathname.startsWith('/finance');
                             
        if (isTargetLink) {
          // Block/remove AI Mode (udm=50) links entirely on search links
          if (linkUrl.pathname === '/search' && linkUrl.searchParams.get('udm') === '50') {
            linkUrl.searchParams.delete('udm');
          }
          
          const cleanResult = cleanUrlParams(linkUrl);
          if (cleanResult.changed) {
            link.href = cleanResult.url.pathname + cleanResult.url.search + cleanResult.url.hash;
          }
        }
      } catch (err) {}
    });

    // Clean Maps links in DOM (tab Maps on search results page)
    document.querySelectorAll('a[href*="maps.google.com"], a[href*="/maps"]').forEach(link => {
      try {
        const linkUrl = new URL(link.href);
        if (linkUrl.hostname === 'maps.google.com' || linkUrl.pathname.startsWith('/maps')) {
          const keysToDelete = [];
          for (const key of linkUrl.searchParams.keys()) {
            if (key !== 'q') keysToDelete.push(key);
          }
          if (keysToDelete.length > 0 || linkUrl.hash) {
            keysToDelete.forEach(key => linkUrl.searchParams.delete(key));
            linkUrl.hash = '';
            link.href = linkUrl.href;
          }
        }
      } catch (err) {}
    });
  }

  // 1. Initial check when script is executed at document_start
  const currentUrl = new URL(window.location.href);

  // Redirect /webhp to homepage
  if (currentUrl.pathname === '/webhp') {
    window.location.replace(currentUrl.origin + '/');
    return;
  }

  // Process URL cleaning on Google Search, Travel (Flights), Finance, and Maps pages
  const isMapsPage = currentUrl.hostname === 'maps.google.com' ||
                     currentUrl.pathname.startsWith('/maps');

  // Handle Google Maps URL cleaning
  if (isMapsPage) {
    const keysToDelete = [];
    for (const key of currentUrl.searchParams.keys()) {
      if (key !== 'q') keysToDelete.push(key);
    }
    if (keysToDelete.length > 0) {
      keysToDelete.forEach(key => currentUrl.searchParams.delete(key));
      if (currentUrl.hash) currentUrl.hash = '';
      window.location.replace(currentUrl.href);
      return;
    }
  }

  const isSearchPage = currentUrl.pathname === '/search' || 
                       currentUrl.pathname.startsWith('/travel/') || 
                       currentUrl.pathname.startsWith('/finance/');

  if (isSearchPage) {
    // If URL has udm=50 (AI Mode), redirect immediately by stripping the udm parameter
    if (currentUrl.searchParams.get('udm') === '50') {
      currentUrl.searchParams.delete('udm');
      const cleanResult = cleanUrlParams(currentUrl);
      window.location.replace(cleanResult.url.href);
      return;
    }

    // Handle primary Google Search redirects
    if (currentUrl.pathname === '/search') {
      if (currentUrl.searchParams.has('q')) {
        const hasTbm = currentUrl.searchParams.has('tbm');
        const hasUdm = currentUrl.searchParams.has('udm');
        const isMissingUdm = !hasTbm && !hasUdm;

        const tempUrl = new URL(currentUrl.href);
        if (isMissingUdm) {
          tempUrl.searchParams.set('udm', '14');
        }
        const cleanResult = cleanUrlParams(tempUrl);

        if (isMissingUdm) {
          window.location.replace(cleanResult.url.href);
          return;
        }

        if (cleanResult.changed) {
          window.history.replaceState(null, '', cleanResult.url.pathname + cleanResult.url.search + cleanResult.url.hash);
        }
      }
    } else {
      // Clean query params on Flights and Finance pages without forcing udm=14
      const cleanResult = cleanUrlParams(currentUrl);
      if (cleanResult.changed) {
        window.history.replaceState(null, '', cleanResult.url.pathname + cleanResult.url.search + cleanResult.url.hash);
      }
    }
  }

  // 2. Inject hidden input to maintain Web tab (udm=14) on default Search form submits
  function injectUdmInput() {
    document.querySelectorAll('form[action="/search"]').forEach(form => {
      if (!form.querySelector('input[name="udm"]') && !form.querySelector('input[name="tbm"]')) {
        const input = document.createElement('input');
        input.type  = 'hidden';
        input.name  = 'udm';
        input.value = '14';
        form.appendChild(input);
      }
    });
  }

  // 3. Intercept and block clicks to /webhp or AI Mode links (udm=50)
  document.addEventListener('click', function (e) {
    // Intercept clicks to /webhp
    const webhpLink = e.target.closest('a[href*="/webhp"]');
    if (webhpLink) {
      e.preventDefault();
      e.stopPropagation();
      window.location.href = window.location.origin + '/';
      return;
    }

    // Intercept clicks to AI Mode tab
    const aiLink = e.target.closest('a[href*="udm=50"]');
    if (aiLink) {
      e.preventDefault();
      e.stopPropagation();
      try {
        const targetUrl = new URL(aiLink.href);
        targetUrl.searchParams.delete('udm');
        const cleanTarget = cleanUrlParams(targetUrl);
        window.location.href = cleanTarget.url.href;
      } catch (err) {
        window.location.href = window.location.origin + '/';
      }
    }
  }, true);

  // 4. Safely monitor AJAX-based URL changes using MutationObserver and popstate
  let lastUrl = window.location.href;
  function checkUrlChange() {
    const activeUrlStr = window.location.href;
    if (activeUrlStr !== lastUrl) {
      lastUrl = activeUrlStr;
      try {
        const activeUrl = new URL(activeUrlStr);
        const isActiveSearchPage = activeUrl.pathname === '/search' || 
                                   activeUrl.pathname.startsWith('/travel/') || 
                                   activeUrl.pathname.startsWith('/finance/');
        if (isActiveSearchPage) {
          // If AJAX navigation loads udm=50, redirect to clean URL immediately
          if (activeUrl.searchParams.get('udm') === '50') {
            activeUrl.searchParams.delete('udm');
            const cleanResult = cleanUrlParams(activeUrl);
            window.location.replace(cleanResult.url.href);
            return;
          }

          if (activeUrl.pathname === '/search') {
            if (activeUrl.searchParams.has('q')) {
              const cleanResult = cleanUrlParams(activeUrl);
              if (cleanResult.changed) {
                window.history.replaceState(null, '', cleanResult.url.pathname + cleanResult.url.search + cleanResult.url.hash);
                lastUrl = window.location.href;
              }
            }
          } else {
            // Clean Flights and Finance URLs during AJAX transitions
            const cleanResult = cleanUrlParams(activeUrl);
            if (cleanResult.changed) {
              window.history.replaceState(null, '', cleanResult.url.pathname + cleanResult.url.search + cleanResult.url.hash);
              lastUrl = window.location.href;
            }
          }
        }
      } catch (e) {}
    }
  }

  // Setup DOM mutation observer to capture AJAX transitions and clean dynamic DOM elements
  const observer = new MutationObserver(() => {
    checkUrlChange();
    cleanDOMSearchLinks();
  });
  
  // Listen for browser Back/Forward navigation changes
  window.addEventListener('popstate', checkUrlChange);

  document.addEventListener('DOMContentLoaded', () => {
    injectUdmInput();
    cleanDOMSearchLinks();
    // Observe DOM mutations to clean dynamically loaded links
    observer.observe(document.documentElement, { childList: true, subtree: true });
    // Fallback polling to check for URL changes and link cleans
    setInterval(() => {
      checkUrlChange();
      cleanDOMSearchLinks();
    }, 100);
  });
})();
