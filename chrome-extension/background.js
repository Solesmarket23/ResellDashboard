// Background script for StockX Price Tracker
chrome.runtime.onInstalled.addListener(() => {
  console.log('StockX Price Tracker extension installed');
});

const SCAN_HISTORY_KEY = 'stockxScanHistory';
const SCAN_COUNTER_KEY = 'stockxScanCounter';
const SCAN_RESUME_KEY_PREFIX = 'stockxListingScanResume:'; // stores large resume payload (urls/config) once per scan

function getScanStateCache() {
  try {
    if (!globalThis.__stockxScanStateCache) globalThis.__stockxScanStateCache = new Map();
    return globalThis.__stockxScanStateCache;
  } catch {
    return null;
  }
}

function getScanResultsCache() {
  try {
    if (!globalThis.__stockxScanResultsCache) globalThis.__stockxScanResultsCache = new Map();
    return globalThis.__stockxScanResultsCache;
  } catch {
    return null;
  }
}

function storageGet(keys) {
  return new Promise((resolve) => {
    try {
      chrome.storage?.local?.get?.(keys, (res) => {
        void chrome.runtime.lastError;
        resolve(res || {});
      });
    } catch {
      resolve({});
    }
  });
}

function storageSet(obj) {
  return new Promise((resolve) => {
    try {
      chrome.storage?.local?.set?.(obj, () => {
        void chrome.runtime.lastError;
        resolve(true);
      });
    } catch {
      resolve(false);
    }
  });
}

function setScanResume(scanId, payload) {
  try {
    if (!scanId) return;
    const key = `${SCAN_RESUME_KEY_PREFIX}${scanId}`;
    chrome.storage?.local?.set?.({ [key]: payload }, () => void chrome.runtime.lastError);
  } catch {}
}

async function getScanResume(scanId) {
  try {
    const id = String(scanId || '');
    if (!id) return null;
    const key = `${SCAN_RESUME_KEY_PREFIX}${id}`;
    const res = await storageGet([key]);
    const v = res?.[key];
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

async function updateScanResume(scanId, patch) {
  try {
    const id = String(scanId || '');
    if (!id) return false;
    const key = `${SCAN_RESUME_KEY_PREFIX}${id}`;
    const res = await storageGet([key]);
    const cur = res?.[key] && typeof res[key] === 'object' ? res[key] : {};
    const next = { ...cur, ...(patch || {}) };
    await storageSet({ [key]: next });
    return true;
  } catch {
    return false;
  }
}

async function allocateNextScanNumber() {
  const res = await storageGet([SCAN_COUNTER_KEY]);
  const cur = Number(res?.[SCAN_COUNTER_KEY] || 0);
  const next = Number.isFinite(cur) && cur >= 0 ? cur + 1 : 1;
  await storageSet({ [SCAN_COUNTER_KEY]: next });
  return next;
}

async function upsertScanHistoryEntry(entry) {
  try {
    const e = entry && typeof entry === 'object' ? entry : null;
    const scanId = String(e?.scanId || '');
    if (!scanId) return false;
    const res = await storageGet([SCAN_HISTORY_KEY]);
    const cur = Array.isArray(res?.[SCAN_HISTORY_KEY]) ? res[SCAN_HISTORY_KEY] : [];
    const next = cur.filter((x) => String(x?.scanId || '') !== scanId);
    next.unshift(e);
    // cap history to last 80 scans
    while (next.length > 80) next.pop();
    await storageSet({ [SCAN_HISTORY_KEY]: next });
    return true;
  } catch {
    return false;
  }
}

async function patchScanHistory(scanId, patch) {
  try {
    const id = String(scanId || '');
    if (!id) return false;
    const res = await storageGet([SCAN_HISTORY_KEY]);
    const cur = Array.isArray(res?.[SCAN_HISTORY_KEY]) ? res[SCAN_HISTORY_KEY] : [];
    let changed = false;
    const next = cur.map((x) => {
      if (String(x?.scanId || '') !== id) return x;
      changed = true;
      return { ...(x || {}), ...(patch || {}) };
    });
    if (!changed) return false;
    await storageSet({ [SCAN_HISTORY_KEY]: next });
    return true;
  } catch {
    return false;
  }
}

function isStockxHomepage(url) {
  try {
    const u = new URL(String(url || ''));
    const host = String(u.hostname || '').toLowerCase();
    if (!(host === 'stockx.com' || host.endsWith('.stockx.com') || host.endsWith('stockx.com'))) return false;
    const path = u.pathname || '/';
    return path === '/' || path === '';
  } catch {
    return false;
  }
}

async function updateActionPopupForTab(tabId, url) {
  try {
    if (!tabId) return;
    const disablePopup = isStockxHomepage(url);
    // Empty string disables the action popup on that tab.
    const popup = disablePopup ? '' : 'popup.html';
    // These MV3 APIs can be promise-based; make sure we never leave a rejection unhandled
    // (tabs can disappear quickly during automation).
    const p1 = chrome.action.setPopup({ tabId, popup });
    if (p1?.catch) p1.catch(() => {});
    // Also disable the action button on homepage so clicking does nothing.
    // This avoids any race where Chrome still opens the default_popup.
    const p2 = disablePopup ? chrome.action.disable(tabId) : chrome.action.enable(tabId);
    if (p2?.catch) p2.catch(() => {});
  } catch (e) {
    // Non-fatal; extension still works with default_popup.
    console.warn('⚠️ Failed to update popup for tab', tabId, e);
  }
}

// Keep the popup disabled on StockX homepage, enabled everywhere else.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = changeInfo.url || tab?.url;
  if (url) updateActionPopupForTab(tabId, url);
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  try {
    chrome.tabs.get(tabId, (tab) => {
      const err = chrome.runtime.lastError;
      if (err) return;
      updateActionPopupForTab(tabId, tab?.url);
    });
  } catch {}
});

// On install/startup, apply the per-tab popup setting to any existing StockX tabs.
async function applyPopupToAllTabs() {
  try {
    chrome.tabs.query({}, (tabs) => {
      const err = chrome.runtime.lastError;
      if (err) return;
      for (const t of tabs || []) updateActionPopupForTab(t.id, t.url);
    });
  } catch {}
}

chrome.runtime.onInstalled.addListener(() => {
  applyPopupToAllTabs();
});

chrome.runtime.onStartup?.addListener?.(() => {
  applyPopupToAllTabs();
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 Background received message:', request);
  const tabId = sender?.tab?.id;
  
  if (request.action === 'fetchMarketData') {
    // Proxy API requests to avoid CORS issues
    fetchMarketData(request.data)
      .then(response => {
        console.log('✅ Background API success:', response);
        sendResponse({success: true, data: response});
      })
      .catch(error => {
        console.error('❌ Background API error:', error);
        sendResponse({success: false, error: error.message});
      });
    return true; // Will respond asynchronously
  }

  if (request.action === 'navigateTo' && typeof request.url === 'string') {
    if (!tabId) {
      sendResponse({ success: false, error: 'No sender tabId' });
      return;
    }
    try {
      console.log('🧭 Background navigating tab', { tabId, url: request.url });
      chrome.tabs.update(tabId, { url: request.url }, () => {
        const err = chrome.runtime.lastError;
        if (err) {
          console.error('❌ Background navigateTo error:', err);
          sendResponse({ success: false, error: err.message || String(err) });
        } else {
          console.log('✅ Background navigateTo success', { tabId });
          sendResponse({ success: true });
        }
      });
    } catch (e) {
      console.error('❌ Background navigateTo exception:', e);
      sendResponse({ success: false, error: e?.message || String(e) });
    }
    return true;
  }

  if (request.action === 'openTab' && typeof request.url === 'string') {
    try {
      chrome.tabs.create({ url: request.url, active: true }, (tab) => {
        const err = chrome.runtime.lastError;
        if (err) {
          console.error('❌ Background openTab error:', err);
          sendResponse({ success: false, error: err.message || String(err) });
        } else {
          // Include opener info so the bid tab can return focus back after completing.
          sendResponse({ success: true, tabId: tab?.id || null, openerTabId: tabId || null, openerUrl: sender?.tab?.url || '' });
        }
      });
    } catch (e) {
      console.error('❌ Background openTab exception:', e);
      sendResponse({ success: false, error: e?.message || String(e) });
    }
    return true;
  }

  if (request.action === 'closeSelfAndFocus') {
    try {
      const selfTabId = tabId;
      const openerTabId = Number(request.openerTabId);
      const returnUrl = typeof request.returnUrl === 'string' ? request.returnUrl : '';

      // Prefer focusing the opener tab; if it doesn't exist, optionally navigate this tab back.
      if (Number.isFinite(openerTabId) && openerTabId > 0) {
        try {
          chrome.tabs.update(openerTabId, { active: true }, () => {
            void chrome.runtime.lastError;
          });
        } catch {}
      } else if (selfTabId && returnUrl) {
        try {
          chrome.tabs.update(selfTabId, { url: returnUrl }, () => {
            void chrome.runtime.lastError;
          });
        } catch {}
      }

      // Closing immediately can sometimes cancel in-flight submit; delay a bit for safety.
      if (selfTabId) {
        setTimeout(() => {
          try {
            chrome.tabs.remove(selfTabId, () => void chrome.runtime.lastError);
          } catch {}
        }, 4500);
      }

      sendResponse({ success: true });
    } catch (e) {
      sendResponse({ success: false, error: e?.message || String(e) });
    }
    return true;
  }

  if (request.action === 'startListingBidScan') {
    if (!tabId) {
      sendResponse({ success: false, error: 'No sender tabId' });
      return;
    }
    // Assign a friendly scan number for the dashboard (Scan 1, Scan 2...)
    allocateNextScanNumber().then((scanNumber) => {
    const startUrl = String(sender?.tab?.url || '');
    const scanMode = String(request?.scanMode || 'listing').toLowerCase(); // 'listing' | 'xpress'
    const scanName = typeof request?.scanName === 'string' && request.scanName.trim() ? request.scanName.trim() : `Scan ${scanNumber}`;
    const urls = Array.isArray(request.urls) ? request.urls.filter((u) => typeof u === 'string') : [];
    const maxItems = Number.isFinite(Number(request.maxItems)) ? Math.max(1, Math.min(48, Number(request.maxItems))) : 12;
    const concurrencyRaw = Number(request.concurrency);
    const requestedConcurrency = Number.isFinite(concurrencyRaw) ? Math.max(1, Math.min(5, concurrencyRaw)) : 1;
    // StockX frequently blocks or fails to render Market Data Bids/Asks in background tabs.
    // For reliability, default listing scans to sequential mode so we can temporarily activate each tab.
    // Users can explicitly opt out by passing allowBackground=true (advanced).
    const allowBackground = !!request.allowBackground;
    const concurrency = allowBackground ? requestedConcurrency : 1;
    const trimmed = urls.slice(0, maxItems);
    const scanId = `scan_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    // Track scan so we can cancel it.
    try {
      if (!globalThis.__stockxActiveScans) globalThis.__stockxActiveScans = new Map();
      globalThis.__stockxActiveScans.set(scanId, { cancelled: false, originTabId: tabId, startUrl, scanMode, activeTabIds: new Set() });
    } catch {}

    // Expose the active scan id so any StockX tab can stop it via a global Stop overlay.
    try {
      chrome.storage?.local?.set?.({ stockxActiveListingScanId: scanId }, () => {
        void chrome.runtime.lastError;
      });
    } catch {}

    // Initialize persisted scan state so the listing UI can poll (even if messages are missed).
    try {
      // Store large resume payload once (urls list). Cursor is stored on scan state and updated frequently.
      setScanResume(scanId, { kind: 'listing', urls: trimmed });
      chrome.storage?.local?.set?.(
        {
          stockxLastListingScanId: scanId,
          [`stockxListingScanState:${scanId}`]: {
            scanId,
            scanNumber,
            scanName,
            originTabId: tabId,
            startUrl,
            startedAt: Date.now(),
            total: trimmed.length,
            completed: 0,
            stage: 'start',
            cancelled: false,
            requestedConcurrency,
            concurrency,
            allowBackground,
            mode: 'listing',
            scanMode,
            resume: {
              kind: 'listing',
              nextIdx: 0,
              inFlightIdx: null
            },
            canResume: concurrency === 1
          },
          [`stockxListingScanResults:${scanId}`]: {}
        },
        () => void chrome.runtime.lastError
      );
    } catch {}
    // Record in history
    upsertScanHistoryEntry({
      scanId,
      scanNumber,
      scanName,
      mode: scanMode,
      startedAt: Date.now(),
      originTabId: tabId,
      total: trimmed.length,
      startUrl
    }).catch(() => {});

    runListingBidScan({ originTabId: tabId, scanId, urls: trimmed, concurrency, scanMode }).catch((e) => {
      try {
        sendToTab(tabId, {
          action: 'listingBidScanDone',
          scanId,
          success: false,
          cancelled: false,
          error: e?.message || String(e)
        });
      } catch {}
      try {
        chrome.storage?.local?.remove?.(['stockxActiveListingScanId'], () => {
          void chrome.runtime.lastError;
        });
      } catch {}
      try {
        setScanState(scanId, { finishedAt: Date.now(), stage: 'done', cancelled: false, success: false, error: e?.message || String(e) });
      } catch {}
    });

    sendResponse({ success: true, scanId, total: trimmed.length });
    }).catch((e) => {
      sendResponse({ success: false, error: e?.message || String(e) });
    });
    return true;
  }

  if (request.action === 'startListingBidScanPaginated') {
    if (!tabId) {
      sendResponse({ success: false, error: 'No sender tabId' });
      return;
    }
    allocateNextScanNumber().then((scanNumber) => {
    const startUrl = typeof request.startUrl === 'string' && request.startUrl ? request.startUrl : (sender?.tab?.url || '');
    const scanMode = String(request?.scanMode || 'listing').toLowerCase(); // 'listing' | 'xpress'
    const scanName = typeof request?.scanName === 'string' && request.scanName.trim() ? request.scanName.trim() : `Scan ${scanNumber}`;
    const perPage = Number.isFinite(Number(request.perPage)) ? Math.max(1, Math.min(48, Number(request.perPage))) : 48;
    const maxPagesRaw = Number(request.maxPages);
    const maxPages = Number.isFinite(maxPagesRaw) ? Math.max(1, Math.min(200, maxPagesRaw)) : 1;
    const collectOpts = request.collectOpts && typeof request.collectOpts === 'object' ? request.collectOpts : {};

    // In paginated mode we keep it sequential to avoid StockX throttling.
    const allowBackground = !!request.allowBackground;
    const requestedConcurrency = 1;
    const concurrency = allowBackground ? requestedConcurrency : 1;

    const scanId = `scan_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    // Track scan so we can cancel it.
    try {
      if (!globalThis.__stockxActiveScans) globalThis.__stockxActiveScans = new Map();
      globalThis.__stockxActiveScans.set(scanId, { cancelled: false, originTabId: tabId, startUrl, scanMode, activeTabIds: new Set() });
    } catch {}

    try {
      chrome.storage?.local?.set?.({ stockxActiveListingScanId: scanId, stockxLastListingScanId: scanId }, () => {
        void chrome.runtime.lastError;
      });
    } catch {}

    // Initialize persisted scan state/results.
    try {
      setScanResume(scanId, { kind: 'paginated', startUrl, maxPages, perPage, collectOpts });
      chrome.storage?.local?.set?.(
        {
          [`stockxListingScanState:${scanId}`]: {
            scanId,
            scanNumber,
            scanName,
            originTabId: tabId,
            startedAt: Date.now(),
            total: maxPages * perPage,
            completed: 0,
            stage: 'start',
            cancelled: false,
            requestedConcurrency,
            concurrency,
            allowBackground,
            mode: 'paginated',
            startUrl,
            scanMode,
            resume: {
              kind: 'paginated',
              startPage: null,
              currentPage: null,
              pageUrls: null,
              nextIdx: 0,
              inFlightIdx: null
            },
            canResume: true
          },
          [`stockxListingScanResults:${scanId}`]: {}
        },
        () => void chrome.runtime.lastError
      );
    } catch {}
    upsertScanHistoryEntry({
      scanId,
      scanNumber,
      scanName,
      mode: scanMode,
      startedAt: Date.now(),
      originTabId: tabId,
      total: maxPages * perPage,
      startUrl
    }).catch(() => {});

    runListingBidScanPaginated({ originTabId: tabId, scanId, startUrl, maxPages, perPage, collectOpts, scanMode }).catch((e) => {
      try {
        sendToTab(tabId, {
          action: 'listingBidScanDone',
          scanId,
          success: false,
          cancelled: false,
          error: e?.message || String(e)
        });
      } catch {}
      try {
        chrome.storage?.local?.remove?.(['stockxActiveListingScanId'], () => {
          void chrome.runtime.lastError;
        });
      } catch {}
      try {
        chrome.storage?.local?.set?.(
          {
            [`stockxListingScanState:${scanId}`]: {
              scanId,
              originTabId: tabId,
              finishedAt: Date.now(),
              total: maxPages * perPage,
              completed: 0,
              stage: 'done',
              cancelled: false,
              success: false,
              error: e?.message || String(e)
            }
          },
          () => void chrome.runtime.lastError
        );
      } catch {}
    });

    sendResponse({ success: true, scanId, total: maxPages * perPage });
    }).catch((e) => {
      sendResponse({ success: false, error: e?.message || String(e) });
    });
    return true;
  }

  if (request.action === 'resumeListingBidScan') {
    const scanId = String(request.scanId || '');
    if (!scanId) {
      sendResponse({ success: false, error: 'Missing scanId' });
      return;
    }
    try {
      const stateKey = `stockxListingScanState:${scanId}`;
      chrome.storage?.local?.get?.([stateKey], (res) => {
        void chrome.runtime.lastError;
        const s = res?.[stateKey] && typeof res[stateKey] === 'object' ? res[stateKey] : null;
        if (!s) return sendResponse({ success: false, error: 'No saved scan state found' });
        if (String(s.stage || '') === 'done' || s.success === true) {
          return sendResponse({ success: false, error: 'Scan already completed' });
        }
        if (String(s.stage || '') !== 'stopped' && s.cancelled !== true) {
          // We only support resuming a stopped/cancelled scan to keep behavior deterministic.
          return sendResponse({ success: false, error: `Scan is not stopped (stage=${String(s.stage || '')})` });
        }

        const resume = s.resume && typeof s.resume === 'object' ? s.resume : null;
        const kind = String(resume?.kind || s.mode || '').toLowerCase();
        if (!resume || !kind) return sendResponse({ success: false, error: 'Scan has no resume data (start a new scan)' });
        if (kind === 'listing' && s.canResume === false) {
          return sendResponse({ success: false, error: 'This scan was not resumable (non-sequential). Start a new scan in sequential mode.' });
        }

        const startUrl = String(s.startUrl || '');
        const preferredOrigin = Number(request.originTabId) || Number(s.originTabId) || 0;
        const allowCreateOriginTab = request.allowCreateOriginTab !== false;

        // Block if another scan is currently active.
        try {
          const activeIdKey = 'stockxActiveListingScanId';
          chrome.storage?.local?.get?.([activeIdKey], (ids) => {
            void chrome.runtime.lastError;
            const active = String(ids?.[activeIdKey] || '');
            if (active && active !== scanId) {
              return sendResponse({ success: false, error: `Another scan is active (${active}). Stop it first.` });
            }

            const ensureOriginTab = (cb) => {
              // Prefer the saved origin StockX tab; if missing and allowed, open a new one to startUrl.
              const useExisting = (tId) => {
                try {
                  chrome.tabs.get(tId, (t) => {
                    const err = chrome.runtime.lastError;
                    if (err || !t?.id) return cb(null);
                    cb(t.id);
                  });
                } catch {
                  cb(null);
                }
              };
              if (Number.isFinite(preferredOrigin) && preferredOrigin > 0) return useExisting(preferredOrigin);
              // Fall back to sender tab if it's a StockX tab.
              if (Number.isFinite(tabId) && tabId > 0) {
                try {
                  chrome.tabs.get(tabId, (t) => {
                    const err = chrome.runtime.lastError;
                    if (!err && t?.url && String(t.url).includes('stockx.com')) return cb(t.id);
                    cb(null);
                  });
                } catch {
                  // ignore
                }
              }
              if (!allowCreateOriginTab || !startUrl) return cb(null);
              try {
                chrome.tabs.create({ url: startUrl, active: true }, (t) => {
                  const err = chrome.runtime.lastError;
                  if (err || !t?.id) return cb(null);
                  cb(t.id);
                });
              } catch {
                cb(null);
              }
            };

            ensureOriginTab((originTabId) => {
              if (!originTabId) {
                return sendResponse({
                  success: false,
                  error: 'Could not find the original StockX tab to resume. Go back to the listing page and click Resume there.'
                });
              }

              // Re-create in-memory scan entry so stop/cancel works.
              try {
                if (!globalThis.__stockxActiveScans) globalThis.__stockxActiveScans = new Map();
                globalThis.__stockxActiveScans.set(scanId, {
                  cancelled: false,
                  originTabId,
                  startUrl,
                  activeTabIds: new Set(),
                  keepUserFocus: !!s.keepUserFocus
                });
              } catch {}

              // Mark active and update originTabId in persisted state.
              try {
                chrome.storage?.local?.set?.({ stockxActiveListingScanId: scanId, stockxLastListingScanId: scanId }, () => {
                  void chrome.runtime.lastError;
                });
              } catch {}
              try {
                setScanState(scanId, { stage: 'resuming', cancelled: false, success: false, originTabId });
              } catch {}

              // Dispatch the resume runner.
              (async () => {
                try {
                  // Load large resume payload (urls/config). Fall back to old embedded data for backward compatibility.
                  const resumePayload = (await getScanResume(scanId)) || null;
                  if (kind === 'paginated') {
                    const maxPages = Number(resumePayload?.maxPages || resume?.maxPages || 1) || 1;
                    const perPage = Number(resumePayload?.perPage || resume?.perPage || 48) || 48;
                    const collectOpts = (resumePayload?.collectOpts && typeof resumePayload.collectOpts === 'object')
                      ? resumePayload.collectOpts
                      : (resume?.collectOpts && typeof resume.collectOpts === 'object' ? resume.collectOpts : {});
                    const effectiveStartUrl = String(resumePayload?.startUrl || s.startUrl || '');
                    const startPage = Number(resume?.startPage || 1) || 1;
                    const currentPage = Number(resume?.currentPage || startPage) || startPage;
                    const pageUrls = Array.isArray(resume?.pageUrls) ? resume.pageUrls : (Array.isArray(resumePayload?.lastPageUrls) && Number(resumePayload?.lastPage) === Number(resume?.currentPage) ? resumePayload.lastPageUrls : null);
                    const nextIdx = Number.isFinite(Number(resume?.nextIdx)) ? Number(resume.nextIdx) : 0;
                    const inFlightIdx = Number.isFinite(Number(resume?.inFlightIdx)) ? Number(resume.inFlightIdx) : null;
                    const effectiveIdx = inFlightIdx != null ? inFlightIdx : nextIdx;

                    await runListingBidScanPaginatedResume({
                      originTabId,
                      scanId,
                      startUrl: effectiveStartUrl,
                      maxPages,
                      perPage,
                      collectOpts,
                      startPage,
                      currentPage,
                      pageUrls,
                      startIdx: Math.max(0, effectiveIdx),
                      completed: Number(s.completed || 0)
                    });
                  } else {
                    const urls = Array.isArray(resumePayload?.urls) ? resumePayload.urls : (Array.isArray(resume?.urls) ? resume.urls : []);
                    if (!urls.length) throw new Error('No URLs saved to resume');
                    const nextIdx = Number.isFinite(Number(resume?.nextIdx)) ? Number(resume.nextIdx) : 0;
                    const inFlightIdx = Number.isFinite(Number(resume?.inFlightIdx)) ? Number(resume.inFlightIdx) : null;
                    const startIdx = Math.max(0, inFlightIdx != null ? inFlightIdx : nextIdx);
                    await runListingBidScanFromIndex({
                      originTabId,
                      scanId,
                      urls,
                      startIdx,
                      completed: Number(s.completed || 0)
                    });
                  }
                } catch (e) {
                  try {
                    sendToTab(originTabId, { action: 'listingBidScanDone', scanId, success: false, cancelled: false, error: e?.message || String(e) });
                  } catch {}
                  try {
                    setScanState(scanId, { stage: 'stopped', cancelled: true, success: false, error: e?.message || String(e), finishedAt: Date.now() });
                  } catch {}
                  try {
                    chrome.storage?.local?.remove?.(['stockxActiveListingScanId'], () => void chrome.runtime.lastError);
                  } catch {}
                  try {
                    globalThis.__stockxActiveScans?.delete?.(scanId);
                  } catch {}
                }
              })();

              sendResponse({ success: true });
            });
          });
        } catch (e) {
          sendResponse({ success: false, error: e?.message || String(e) });
        }
      });
    } catch (e) {
      sendResponse({ success: false, error: e?.message || String(e) });
    }
    return true;
  }

  if (request.action === 'stopListingBidScan') {
    const scanId = String(request.scanId || '');
    if (!scanId) {
      sendResponse({ success: false, error: 'Missing scanId' });
      return;
    }
    try {
      const scans = globalThis.__stockxActiveScans;
      const entry = scans?.get(scanId);
      if (!entry) {
        sendResponse({ success: false, error: 'Unknown scanId (maybe already finished)' });
        return;
      }
      entry.cancelled = true;
      // Close any tabs currently opened for scanning.
      try {
        for (const tId of entry.activeTabIds || []) closeTab(tId);
      } catch {}
      sendResponse({ success: true });
      // Notify UI immediately
      sendToTab(entry.originTabId, { action: 'listingBidScanDone', scanId, success: false, cancelled: true, total: 0 });
      // Restore the origin tab back to the start URL so it isn't left on a blank/intermediate page.
      try {
        const startUrl = String(entry.startUrl || '');
        if (entry.originTabId && startUrl) {
          chrome.tabs.update(entry.originTabId, { url: startUrl }, () => void chrome.runtime.lastError);
        } else if (entry.originTabId) {
          chrome.tabs.reload(entry.originTabId, {}, () => void chrome.runtime.lastError);
        }
      } catch {}
      try {
        chrome.storage?.local?.remove?.(['stockxActiveListingScanId'], () => {
          void chrome.runtime.lastError;
        });
      } catch {}
      try {
        setScanState(scanId, { finishedAt: Date.now(), stage: 'stopped', cancelled: true, success: false });
      } catch {}
      try { patchScanHistory(scanId, { finishedAt: Date.now(), success: false, cancelled: true }); } catch {}
      return;
    } catch (e) {
      sendResponse({ success: false, error: e?.message || String(e) });
      return;
    }
  }

  if (request.action === 'setListingScanFocusMode') {
    const scanId = String(request.scanId || '');
    const keepUserFocus = !!request.keepUserFocus;
    if (!scanId) {
      sendResponse({ success: false, error: 'Missing scanId' });
      return;
    }
    try {
      const entry = getScanEntry(scanId);
      if (entry) entry.keepUserFocus = keepUserFocus;
      // Persist on scan state so dashboard can reflect it.
      setScanState(scanId, { keepUserFocus });
      sendResponse({ success: true });
      return true;
    } catch (e) {
      sendResponse({ success: false, error: e?.message || String(e) });
      return true;
    }
  }
});

async function runListingBidScanFromIndex({ originTabId, scanId, urls, startIdx, completed, scanMode }) {
  const total = Array.isArray(urls) ? urls.length : 0;
  let nextIdx = Math.max(0, Math.min(total, Number(startIdx) || 0));
  let done = Math.max(0, Number(completed) || 0);

  sendToTab(originTabId, { action: 'listingBidScanProgress', scanId, stage: `resuming (${nextIdx}/${total})`, current: done, total });
  setScanState(scanId, { stage: `resuming (${nextIdx}/${total})`, total, completed: done, cancelled: false, canResume: true, resume: { kind: 'listing', nextIdx, inFlightIdx: null } });

  // Force sequential for deterministic resume.
  const concurrency = 1;

  while (nextIdx < total) {
    if (isScanCancelled(scanId)) break;
    const i = nextIdx;
    nextIdx += 1;
    const url = urls[i];

    // Persist resume cursor before opening.
    setScanState(scanId, { stage: 'opening', total, completed: done, currentUrl: url, canResume: true, resume: { kind: 'listing', nextIdx, inFlightIdx: i } });

    const tab = await createInactiveTab(url, scanId);
    if (!tab?.id) {
      done += 1;
      sendToTab(originTabId, { action: 'listingBidScanResult', scanId, success: false, url, error: 'Failed to open tab' });
      setScanResult(scanId, url, { url, success: false, error: 'Failed to open tab' });
      setScanState(scanId, { stage: 'scanned', total, completed: done, currentUrl: url, canResume: true, resume: { kind: 'listing', nextIdx, inFlightIdx: null } });
      continue;
    }
    trackScanTab(scanId, tab.id);

    const loaded = await waitForTabComplete(tab.id, 35000);
    if (!loaded) {
      closeTab(tab.id);
      untrackScanTab(scanId, tab.id);
      done += 1;
      sendToTab(originTabId, { action: 'listingBidScanResult', scanId, success: false, url, error: 'Tab load timed out' });
      setScanResult(scanId, url, { url, success: false, error: 'Tab load timed out' });
      setScanState(scanId, { stage: 'scanned', total, completed: done, currentUrl: url, canResume: true, resume: { kind: 'listing', nextIdx, inFlightIdx: null } });
      continue;
    }

    if (isScanCancelled(scanId)) {
      closeTab(tab.id);
      untrackScanTab(scanId, tab.id);
      break;
    }

    // Activate each tab for reliable Market Data behavior unless user wants background mode.
    if (!getScanEntry(scanId)?.keepUserFocus) {
      await activateTab(tab.id);
      await new Promise((r) => setTimeout(r, 1500));
    } else {
      await new Promise((r) => setTimeout(r, 2200));
    }

    sendToTab(originTabId, { action: 'listingBidScanProgress', scanId, stage: 'scanning', current: done, total, url });
    setScanState(scanId, { stage: 'scanning', total, completed: done, currentUrl: url, canResume: true, resume: { kind: 'listing', nextIdx, inFlightIdx: i } });

    const effectiveMode = String(scanMode || getScanEntry(scanId)?.scanMode || 'listing').toLowerCase();
    const action = effectiveMode === 'xpress' ? 'scanProductXpressDeals' : 'scanProductBidOpportunities';
    const resp = await requestScanFromTab(tab.id, { action, scanId, url, mode: 'listing' }, 120000);

    closeTab(tab.id);
    untrackScanTab(scanId, tab.id);

    done += 1;
    sendToTab(originTabId, { action: 'listingBidScanResult', scanId, url, ...(resp || { success: false, error: 'No response' }) });
    setScanResult(scanId, url, { url, ...(resp || { success: false, error: 'No response' }) });
    setScanState(scanId, { stage: 'scanned', total, completed: done, currentUrl: url, canResume: true, resume: { kind: 'listing', nextIdx, inFlightIdx: null } });

    if (!getScanEntry(scanId)?.keepUserFocus) {
      await activateTab(originTabId);
    }
  }

  if (isScanCancelled(scanId)) {
    sendToTab(originTabId, { action: 'listingBidScanDone', scanId, success: false, cancelled: true, total });
    setScanState(scanId, { stage: 'stopped', total, completed: done, cancelled: true, success: false, finishedAt: Date.now(), canResume: true, resume: { kind: 'listing', nextIdx, inFlightIdx: null } });
    try { await patchScanHistory(scanId, { finishedAt: Date.now(), success: false, cancelled: true, completed: done }); } catch {}
  } else {
    sendToTab(originTabId, { action: 'listingBidScanDone', scanId, success: true, cancelled: false, total });
    setScanState(scanId, { stage: 'done', total, completed: done, cancelled: false, success: true, finishedAt: Date.now() });
    try { await patchScanHistory(scanId, { finishedAt: Date.now(), success: true, cancelled: false, completed: done }); } catch {}
  }

  try {
    globalThis.__stockxActiveScans?.delete?.(scanId);
  } catch {}
  try {
    chrome.storage?.local?.remove?.(['stockxActiveListingScanId'], () => void chrome.runtime.lastError);
  } catch {}
}

async function runListingBidScanPaginatedResume({
  originTabId,
  scanId,
  startUrl,
  maxPages,
  perPage,
  collectOpts,
  startPage,
  currentPage,
  pageUrls,
  startIdx,
  completed,
  scanMode
}) {
  const total = Math.max(1, Number(maxPages) || 1) * Math.max(1, Number(perPage) || 48);
  let done = Math.max(0, Number(completed) || 0);
  const opts = collectOpts && typeof collectOpts === 'object' ? collectOpts : {};
  const sp = Number(startPage) || 1;
  const startP = Number(currentPage) || sp;

  // Continue pages from currentPage through remaining range.
  for (let pageNum = startP; pageNum < sp + maxPages; pageNum++) {
    if (isScanCancelled(scanId)) break;

    const pageUrl = buildSearchPageUrl(startUrl, pageNum);
    sendToTab(originTabId, { action: 'listingBidScanProgress', scanId, stage: `resume page ${pageNum} (loading)`, current: done, total, url: pageUrl });
    setScanState(scanId, {
      stage: `resume page ${pageNum} loading`,
      total,
      completed: done,
      currentPage: pageNum,
      currentUrl: pageUrl,
      canResume: true,
      resume: { kind: 'paginated', startUrl, maxPages, perPage, collectOpts: opts, startPage: sp, currentPage: pageNum, pageUrls: null, nextIdx: 0, inFlightIdx: null }
    });

    const nav = await navigateTabTo(originTabId, pageUrl, 60000);
    if (!nav.ok) break;
    await new Promise((r) => setTimeout(r, 1600));
    if (isScanCancelled(scanId)) break;

    // Determine URLs for this page: use saved pageUrls for the first page only, otherwise recollect (with retries).
    let urls = [];
    if (pageNum === startP && Array.isArray(pageUrls) && pageUrls.length) {
      urls = pageUrls;
    } else {
      for (let attempt = 0; attempt < 3; attempt++) {
        const collected = await requestUrlsFromOriginTab(originTabId, { perPage, opts }, 25000);
        urls = Array.isArray(collected?.urls) ? collected.urls : [];
        if (urls.length) break;
        await new Promise((r) => setTimeout(r, 1200 + attempt * 700));
      }
    }
    if (!urls.length) break;

    // Persist this page's urls once for exact resume.
    try {
      await updateScanResume(scanId, { kind: 'paginated', startUrl, maxPages, perPage, collectOpts: opts || {}, lastPage: pageNum, lastPageUrls: urls });
    } catch {}

    let idx = pageNum === startP ? Math.max(0, Number(startIdx) || 0) : 0;
    for (; idx < urls.length; idx++) {
      if (isScanCancelled(scanId)) break;
      const url = urls[idx];

      setScanState(scanId, {
        stage: `page ${pageNum} opening`,
        total,
        completed: done,
        currentPage: pageNum,
        currentUrl: url,
        canResume: true,
        resume: { kind: 'paginated', startPage: sp, currentPage: pageNum, nextIdx: idx + 1, inFlightIdx: idx }
      });

      const tab = await createInactiveTab(url, scanId);
      if (!tab?.id) {
        done += 1;
        sendToTab(originTabId, { action: 'listingBidScanResult', scanId, success: false, url, error: 'Failed to open tab' });
        setScanResult(scanId, url, { url, success: false, error: 'Failed to open tab' });
        continue;
      }
      trackScanTab(scanId, tab.id);

      const loaded = await waitForTabComplete(tab.id, 35000);
      if (!loaded) {
        closeTab(tab.id);
        untrackScanTab(scanId, tab.id);
        done += 1;
        sendToTab(originTabId, { action: 'listingBidScanResult', scanId, success: false, url, error: 'Tab load timed out' });
        setScanResult(scanId, url, { url, success: false, error: 'Tab load timed out' });
        continue;
      }

      if (isScanCancelled(scanId)) {
        closeTab(tab.id);
        untrackScanTab(scanId, tab.id);
        break;
      }

      if (!getScanEntry(scanId)?.keepUserFocus) {
        await activateTab(tab.id);
        await new Promise((r) => setTimeout(r, 1500));
      } else {
        await new Promise((r) => setTimeout(r, 2200));
      }

      const effectiveMode = String(scanMode || getScanEntry(scanId)?.scanMode || 'listing').toLowerCase();
      const action = effectiveMode === 'xpress' ? 'scanProductXpressDeals' : 'scanProductBidOpportunities';
      const resp = await requestScanFromTab(tab.id, { action, scanId, url, mode: 'listing' }, 120000);
      closeTab(tab.id);
      untrackScanTab(scanId, tab.id);

      done += 1;
      sendToTab(originTabId, { action: 'listingBidScanResult', scanId, url, ...(resp || { success: false, error: 'No response' }) });
      setScanResult(scanId, url, { url, ...(resp || { success: false, error: 'No response' }) });
      setScanState(scanId, {
        stage: `page ${pageNum} scanned`,
        total,
        completed: done,
        currentPage: pageNum,
        currentUrl: url,
        canResume: true,
        resume: { kind: 'paginated', startPage: sp, currentPage: pageNum, nextIdx: idx + 1, inFlightIdx: null }
      });

      if (!getScanEntry(scanId)?.keepUserFocus) {
        await activateTab(originTabId);
      }
    }
  }

  if (isScanCancelled(scanId)) {
    sendToTab(originTabId, { action: 'listingBidScanDone', scanId, success: false, cancelled: true, total });
    setScanState(scanId, { stage: 'stopped', total, completed: done, cancelled: true, success: false, finishedAt: Date.now(), canResume: true });
    try { await patchScanHistory(scanId, { finishedAt: Date.now(), success: false, cancelled: true, completed: done }); } catch {}
  } else {
    sendToTab(originTabId, { action: 'listingBidScanDone', scanId, success: true, cancelled: false, total });
    setScanState(scanId, { stage: 'done', total, completed: done, cancelled: false, success: true, finishedAt: Date.now() });
    try { await patchScanHistory(scanId, { finishedAt: Date.now(), success: true, cancelled: false, completed: done }); } catch {}
  }

  try {
    globalThis.__stockxActiveScans?.delete?.(scanId);
  } catch {}
  try {
    chrome.storage?.local?.remove?.(['stockxActiveListingScanId'], () => void chrome.runtime.lastError);
  } catch {}
}

function setScanState(scanId, patch) {
  try {
    if (!scanId) return;
    const key = `stockxListingScanState:${scanId}`;
    const cache = getScanStateCache();
    const cached = cache?.get?.(scanId) || null;
    if (cached) {
      const next = { ...cached, ...(patch || {}), updatedAt: Date.now() };
      cache.set(scanId, next);
      chrome.storage?.local?.set?.({ [key]: next }, () => void chrome.runtime.lastError);
      return;
    }
    // First write after service-worker restart: hydrate once from storage then cache.
    chrome.storage?.local?.get?.([key], (res) => {
      void chrome.runtime.lastError;
      const cur = res?.[key] && typeof res[key] === 'object' ? res[key] : { scanId };
      const next = { ...cur, ...(patch || {}), updatedAt: Date.now() };
      try {
        cache?.set?.(scanId, next);
      } catch {}
      chrome.storage?.local?.set?.({ [key]: next }, () => void chrome.runtime.lastError);
    });
  } catch {}
}

function setScanResult(scanId, url, result) {
  try {
    if (!scanId || !url) return;
    const key = `stockxListingScanResults:${scanId}`;
    const cache = getScanResultsCache();
    const entry = cache?.get?.(scanId) || null;
    const upsert = (data) => {
      // Include a timestamp so the UI/debug can verify what is actually persisted.
      data[url] = { scanId, ...(result || {}), savedAt: Date.now() };
      if (!cache) {
        chrome.storage?.local?.set?.({ [key]: data }, () => void chrome.runtime.lastError);
        return;
      }
      const curEntry = cache.get(scanId) || { data: {}, dirty: false, timer: null };
      curEntry.data = data;
      curEntry.dirty = true;
      if (!curEntry.timer) {
        curEntry.timer = setTimeout(() => {
          try {
            const e = cache.get(scanId);
            if (!e || !e.dirty) return;
            e.dirty = false;
            e.timer = null;
            chrome.storage?.local?.set?.({ [key]: e.data }, () => void chrome.runtime.lastError);
          } catch {}
        }, 700);
      }
      cache.set(scanId, curEntry);
    };

    if (entry && entry.data) {
      upsert(entry.data);
      return;
    }

    // First result write: hydrate once, then batch flush thereafter.
    chrome.storage?.local?.get?.([key], (res) => {
      void chrome.runtime.lastError;
      const cur = res?.[key] && typeof res[key] === 'object' ? res[key] : {};
      try {
        cache?.set?.(scanId, { data: cur, dirty: false, timer: null });
      } catch {}
      upsert(cur);
    });
    // Also update the global opportunities index (best-effort).
    try {
      updateOpportunitiesIndexFromResult(scanId, { url, ...(result || {}) });
    } catch {}
  } catch {}
}

function updateOpportunitiesIndexFromResult(scanId, result) {
  // Persist profitable opportunities so we can later run an automated bidding mode
  // and avoid re-bidding the same (slug,size) over and over.
  try {
    const slug = String(result?.slug || '').trim();
    const baseUrl = String(result?.url || '').trim();
    if (!slug || !baseUrl) return;
    const opps = Array.isArray(result?.opportunities) ? result.opportunities : [];
    if (!opps.length) return;

    const key = 'stockxOpportunityIndex';
    chrome.storage?.local?.get?.([key], (res) => {
      void chrome.runtime.lastError;
      const cur = res?.[key] && typeof res[key] === 'object' ? res[key] : {};
      const now = Date.now();

      for (const o of opps) {
        const sizeParam = String(o?.sizeParam || '').trim();
        const sizeLabel = String(o?.sizeLabel || '').trim();
        if (!sizeParam || !sizeLabel) continue;
        const entryKey = `${slug}::${sizeParam}`;
        cur[entryKey] = {
          key: entryKey,
          scanId,
          slug,
          url: baseUrl,
          sizeLabel,
          sizeParam,
          highestBid: o?.highestBid ?? null,
          lowestAsk: o?.lowestAsk ?? null,
          profit: o?.profit ?? null,
          avg30d: o?.avg30d ?? null,
          lowestSold2mo: o?.lowestSold2mo ?? null,
          sales30d: o?.sales30d ?? null,
          updatedAt: now
        };
      }

      // Soft prune: drop entries older than 14 days
      for (const [k2, v] of Object.entries(cur)) {
        const ts = Number(v?.updatedAt || 0);
        if (ts && now - ts > 14 * 24 * 60 * 60 * 1000) delete cur[k2];
      }

      chrome.storage?.local?.set?.({ [key]: cur }, () => void chrome.runtime.lastError);
    });
  } catch {}
}

function sendToTab(tabId, msg) {
  try {
    // Avoid unhandled promise rejections and ignore "No tab with id" races.
    const p = chrome.tabs.sendMessage(tabId, msg, () => {
      // Swallow lastError (e.g. no receiver / tab closed)
      void chrome.runtime.lastError;
    });
    if (p?.catch) p.catch(() => {});
  } catch {}
}

function getScanEntry(scanId) {
  try {
    const scans = globalThis.__stockxActiveScans;
    return scans?.get(scanId) || null;
  } catch {
    return null;
  }
}

function isScanCancelled(scanId) {
  try {
    const entry = getScanEntry(scanId);
    return !!entry?.cancelled;
  } catch {
    return false;
  }
}

function trackScanTab(scanId, tabId) {
  try {
    const entry = getScanEntry(scanId);
    if (!entry) return;
    entry.activeTabIds?.add?.(tabId);
  } catch {}
}

function untrackScanTab(scanId, tabId) {
  try {
    const entry = getScanEntry(scanId);
    if (!entry) return;
    entry.activeTabIds?.delete?.(tabId);
  } catch {}
}

function waitForTabComplete(tabId, timeoutMs = 30000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      try {
        chrome.tabs.onUpdated.removeListener(onUpdated);
      } catch {}
      try {
        chrome.tabs.onRemoved.removeListener(onRemoved);
      } catch {}
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    const onUpdated = (id, changeInfo) => {
      if (id !== tabId) return;
      if (changeInfo.status === 'complete') {
        clearTimeout(timer);
        finish(true);
      }
    };
    const onRemoved = (id) => {
      if (id !== tabId) return;
      clearTimeout(timer);
      finish(false);
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
  });
}

function withScanParams(url, scanId) {
  try {
    const u = new URL(String(url || ''));
    u.searchParams.set('extScan', '1');
    return u.toString();
  } catch {
    return url;
  }
}

function createInactiveTab(url, scanId) {
  return new Promise((resolve) => {
    chrome.tabs.create({ url: withScanParams(url, scanId), active: false }, (tab) => {
      const err = chrome.runtime.lastError;
      if (err) return resolve(null);
      resolve(tab);
    });
  });
}

function activateTab(tabId) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.update(tabId, { active: true }, () => {
        void chrome.runtime.lastError;
        resolve(true);
      });
    } catch {
      resolve(false);
    }
  });
}

function closeTab(tabId) {
  try {
    if (!tabId) return;
    const p = chrome.tabs.remove(tabId, () => {
      void chrome.runtime.lastError;
    });
    if (p?.catch) p.catch(() => {});
  } catch {}
}

function requestScanFromTab(tabId, payload, timeoutMs = 90000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (res) => {
      if (done) return;
      done = true;
      resolve(res);
    };
    const timer = setTimeout(() => finish({ success: false, error: 'Scan timed out' }), timeoutMs);

    const trySend = (attempt) => {
      try {
        chrome.tabs.sendMessage(tabId, payload, (resp) => {
          const err = chrome.runtime.lastError;
          if (err) {
            const msg = err.message || String(err);
            // Common race: content script not injected yet.
            const retryable =
              /Receiving end does not exist/i.test(msg) ||
              /message channel closed before a response was received/i.test(msg) ||
              /The message port closed before a response was received/i.test(msg) ||
              /Extension context invalidated/i.test(msg);
            if (attempt < 6 && retryable) {
              return setTimeout(() => trySend(attempt + 1), 900);
            }
            clearTimeout(timer);
            return finish({ success: false, error: msg });
          }
          clearTimeout(timer);
          finish(resp || { success: false, error: 'No response' });
        });
      } catch (e) {
        if (attempt < 6) return setTimeout(() => trySend(attempt + 1), 900);
        clearTimeout(timer);
        finish({ success: false, error: e?.message || String(e) });
      }
    };

    // Give the tab a beat after 'complete' for content scripts to attach.
    setTimeout(() => trySend(1), 500);
  });
}

function buildSearchPageUrl(startUrl, pageNum) {
  try {
    const u = new URL(String(startUrl || ''));
    if (pageNum <= 1) u.searchParams.delete('page');
    else u.searchParams.set('page', String(pageNum));
    return u.toString();
  } catch {
    return String(startUrl || '');
  }
}

function requestUrlsFromOriginTab(tabId, { perPage, opts }, timeoutMs = 20000) {
  return requestScanFromTab(
    tabId,
    { action: 'collectListingProductUrls', maxItems: perPage, opts: opts || {} },
    timeoutMs
  );
}

async function navigateTabTo(tabId, url, timeoutMs = 45000) {
  return await new Promise((resolve) => {
    try {
      chrome.tabs.update(tabId, { url }, async () => {
        const err = chrome.runtime.lastError;
        if (err) return resolve({ ok: false, error: err.message || String(err) });
        const loaded = await waitForTabComplete(tabId, timeoutMs);
        resolve({ ok: !!loaded });
      });
    } catch (e) {
      resolve({ ok: false, error: e?.message || String(e) });
    }
  });
}

async function runListingBidScanPaginated({ originTabId, scanId, startUrl, maxPages, perPage, collectOpts, scanMode }) {
  const total = Math.max(1, Number(maxPages) || 1) * Math.max(1, Number(perPage) || 48);
  let completed = 0;

  const entry = getScanEntry(scanId);
  const opts = collectOpts && typeof collectOpts === 'object' ? collectOpts : {};

  const startPage = (() => {
    try {
      const u = new URL(String(startUrl || ''));
      const p = Number(u.searchParams.get('page') || '1');
      return Number.isFinite(p) && p > 0 ? p : 1;
    } catch {
      return 1;
    }
  })();
  // Persist resume config early
  try {
    setScanState(scanId, {
      canResume: true,
      resume: {
        kind: 'paginated',
        startUrl,
        maxPages,
        perPage,
        collectOpts: opts || {},
        startPage,
        currentPage: startPage,
        pageUrls: null,
        nextIdx: 0,
        inFlightIdx: null
      }
    });
  } catch {}

  for (let pageNum = startPage; pageNum < startPage + maxPages; pageNum++) {
    if (isScanCancelled(scanId)) break;

    const pageUrl = buildSearchPageUrl(startUrl, pageNum);
    sendToTab(originTabId, { action: 'listingBidScanProgress', scanId, stage: `page ${pageNum}/${startPage + maxPages - 1} (loading)`, current: completed, total, url: pageUrl });
    setScanState(scanId, { stage: `page ${pageNum} loading`, total, completed, currentPage: pageNum, currentUrl: pageUrl });

    const nav = await navigateTabTo(originTabId, pageUrl, 60000);
    if (!nav.ok) break;

    // Give the SPA time to hydrate and render cards
    await new Promise((r) => setTimeout(r, 1600));

    if (isScanCancelled(scanId)) break;
    sendToTab(originTabId, { action: 'listingBidScanProgress', scanId, stage: `page ${pageNum} (collecting)`, current: completed, total, url: pageUrl });
    setScanState(scanId, { stage: `page ${pageNum} collecting`, total, completed, currentPage: pageNum, currentUrl: pageUrl });

    let urls = [];
    // Collect retries: StockX sometimes returns an empty grid for a moment (SPA/hydration).
    for (let attempt = 0; attempt < 3; attempt++) {
      const collected = await requestUrlsFromOriginTab(originTabId, { perPage, opts }, 25000);
      urls = Array.isArray(collected?.urls) ? collected.urls : [];
      if (urls.length) break;
      await new Promise((r) => setTimeout(r, 1200 + attempt * 700));
    }
    if (!urls.length) {
      // Ended early: mark as stopped so it can be resumed.
      setScanState(scanId, { stage: `stopped (no urls on page ${pageNum})`, cancelled: true, success: false, canResume: true, finishedAt: Date.now() });
      break;
    }

    // Store current page URLs once for exact resume. Avoid putting this array into scan state (expensive).
    try {
      await updateScanResume(scanId, { kind: 'paginated', startUrl, maxPages, perPage, collectOpts: opts || {}, lastPage: pageNum, lastPageUrls: urls });
    } catch {}

    // Scan these URLs sequentially by reusing the existing scan runner logic in-page.
    for (let i = 0; i < urls.length; i++) {
      if (isScanCancelled(scanId)) break;
      const url = urls[i];

      // Persist resume cursor (page + index) before opening the scan tab.
      try {
        setScanState(scanId, {
          canResume: true,
          resume: {
            kind: 'paginated',
            startPage,
            currentPage: pageNum,
            nextIdx: i + 1,
            inFlightIdx: i
          }
        });
      } catch {}

      sendToTab(originTabId, {
        action: 'listingBidScanProgress',
        scanId,
        stage: `page ${pageNum} (opening)`,
        current: completed,
        total,
        url
      });
      setScanState(scanId, { stage: `page ${pageNum} opening`, total, completed, currentUrl: url, currentPage: pageNum });

      const tab = await createInactiveTab(url, scanId);
      if (!tab?.id) {
        completed += 1;
        sendToTab(originTabId, { action: 'listingBidScanResult', scanId, success: false, url, error: 'Failed to open tab' });
        setScanResult(scanId, url, { url, success: false, error: 'Failed to open tab' });
        continue;
      }
      trackScanTab(scanId, tab.id);

      const loaded = await waitForTabComplete(tab.id, 35000);
      if (!loaded) {
        closeTab(tab.id);
        untrackScanTab(scanId, tab.id);
        completed += 1;
        sendToTab(originTabId, { action: 'listingBidScanResult', scanId, success: false, url, error: 'Tab load timed out' });
        setScanResult(scanId, url, { url, success: false, error: 'Tab load timed out' });
        continue;
      }

      if (isScanCancelled(scanId)) {
        closeTab(tab.id);
        untrackScanTab(scanId, tab.id);
        break;
      }

      // Activate each tab for reliable Market Data behavior.
      if (!getScanEntry(scanId)?.keepUserFocus) {
        await activateTab(tab.id);
        await new Promise((r) => setTimeout(r, 1500));
      } else {
        // Background mode: don't steal focus; give the page a beat anyway.
        await new Promise((r) => setTimeout(r, 2200));
      }

      sendToTab(originTabId, { action: 'listingBidScanProgress', scanId, stage: `page ${pageNum} (scanning)`, current: completed, total, url });
      setScanState(scanId, { stage: `page ${pageNum} scanning`, total, completed, currentUrl: url, currentPage: pageNum });

      const effectiveMode = String(scanMode || getScanEntry(scanId)?.scanMode || 'listing').toLowerCase();
      const action = effectiveMode === 'xpress' ? 'scanProductXpressDeals' : 'scanProductBidOpportunities';
      const resp = await requestScanFromTab(tab.id, { action, scanId, url, mode: 'listing' }, 120000);

      closeTab(tab.id);
      untrackScanTab(scanId, tab.id);

      completed += 1;
      sendToTab(originTabId, { action: 'listingBidScanResult', scanId, url, ...(resp || { success: false, error: 'No response' }) });
      setScanResult(scanId, url, { url, ...(resp || { success: false, error: 'No response' }) });
      sendToTab(originTabId, { action: 'listingBidScanProgress', scanId, stage: `page ${pageNum} (scanned)`, current: completed, total });
      setScanState(scanId, {
        stage: `page ${pageNum} scanned`,
        total,
        completed,
        currentUrl: url,
        currentPage: pageNum,
        canResume: true,
        resume: {
          kind: 'paginated',
          startPage,
          currentPage: pageNum,
          nextIdx: i + 1,
          inFlightIdx: null
        }
      });

      // Return user to the origin tab after each scan tab.
      if (!getScanEntry(scanId)?.keepUserFocus) {
        await activateTab(originTabId);
      }
    }
  }

  const cancelled = isScanCancelled(scanId);
  if (cancelled) {
    sendToTab(originTabId, { action: 'listingBidScanDone', scanId, success: false, cancelled: true, total });
    // Note: resume cursor already persisted during the loop; keep it.
    setScanState(scanId, { stage: 'stopped', total, completed, cancelled: true, success: false, finishedAt: Date.now(), canResume: true });
    try { await patchScanHistory(scanId, { finishedAt: Date.now(), success: false, cancelled: true, completed }); } catch {}
  } else {
    sendToTab(originTabId, { action: 'listingBidScanDone', scanId, success: true, cancelled: false, total });
    setScanState(scanId, { stage: 'done', total, completed, cancelled: false, success: true, finishedAt: Date.now() });
    try { await patchScanHistory(scanId, { finishedAt: Date.now(), success: true, cancelled: false, completed }); } catch {}
  }
  try {
    globalThis.__stockxActiveScans?.delete?.(scanId);
  } catch {}
  try {
    chrome.storage?.local?.remove?.(['stockxActiveListingScanId'], () => {
      void chrome.runtime.lastError;
    });
  } catch {}
}

async function runListingBidScan({ originTabId, scanId, urls }) {
  const total = Array.isArray(urls) ? urls.length : 0;
  const concurrency = Math.max(1, Math.min(5, Number(arguments[0]?.concurrency) || 3));
  const scanMode = String(arguments[0]?.scanMode || getScanEntry(scanId)?.scanMode || 'listing').toLowerCase();
  sendToTab(originTabId, { action: 'listingBidScanProgress', scanId, stage: 'start', current: 0, total });
  setScanState(scanId, { stage: 'start', total, completed: 0, cancelled: false });

  let nextIdx = 0;
  let completed = 0;

  const runOne = async () => {
    if (isScanCancelled(scanId)) return;
    const i = nextIdx;
    nextIdx += 1;
    if (i >= total) return;
    if (isScanCancelled(scanId)) return;

    const url = urls[i];
    // Persist resume cursor (best-effort). For non-sequential scans we don't claim resumability.
    try {
      setScanState(scanId, {
        canResume: concurrency === 1,
        resume: { kind: 'listing', nextIdx: i + 1, inFlightIdx: i }
      });
    } catch {}
    sendToTab(originTabId, {
      action: 'listingBidScanProgress',
      scanId,
      stage: 'opening',
      current: completed,
      total,
      url
    });
    setScanState(scanId, { stage: 'opening', total, completed, currentUrl: url });

    const tab = await createInactiveTab(url, scanId);
    if (!tab?.id) {
      completed += 1;
      sendToTab(originTabId, { action: 'listingBidScanResult', scanId, success: false, url, error: 'Failed to open tab' });
      sendToTab(originTabId, { action: 'listingBidScanProgress', scanId, stage: 'scanned', current: completed, total });
      return runOne();
    }
    trackScanTab(scanId, tab.id);

    const loaded = await waitForTabComplete(tab.id, 35000);
    if (!loaded) {
      closeTab(tab.id);
      untrackScanTab(scanId, tab.id);
      completed += 1;
      sendToTab(originTabId, { action: 'listingBidScanResult', scanId, success: false, url, error: 'Tab load timed out' });
      sendToTab(originTabId, { action: 'listingBidScanProgress', scanId, stage: 'scanned', current: completed, total });
      return runOne();
    }

    if (isScanCancelled(scanId)) {
      closeTab(tab.id);
      untrackScanTab(scanId, tab.id);
      return;
    }

    sendToTab(originTabId, { action: 'listingBidScanProgress', scanId, stage: 'scanning', current: completed, total, url });
    setScanState(scanId, { stage: 'scanning', total, completed, currentUrl: url });

    // Important: StockX often blocks modal interactions in background tabs.
    // When running sequentially, temporarily activate the tab so Market Data opens reliably.
    if (concurrency === 1) {
      if (!getScanEntry(scanId)?.keepUserFocus) {
        await activateTab(tab.id);
        // give the page a beat to become interactive
        await new Promise((r) => setTimeout(r, 1500));
      } else {
        await new Promise((r) => setTimeout(r, 2200));
      }
    }

    const action = scanMode === 'xpress' ? 'scanProductXpressDeals' : 'scanProductBidOpportunities';
    const resp = await requestScanFromTab(tab.id, { action, scanId, url, mode: 'listing' }, 120000);
    closeTab(tab.id);
    untrackScanTab(scanId, tab.id);

    completed += 1;
    sendToTab(originTabId, { action: 'listingBidScanResult', scanId, url, ...(resp || { success: false, error: 'No response' }) });
    setScanResult(scanId, url, { url, ...(resp || { success: false, error: 'No response' }) });
    sendToTab(originTabId, { action: 'listingBidScanProgress', scanId, stage: 'scanned', current: completed, total });
    setScanState(scanId, {
      stage: 'scanned',
      total,
      completed,
      currentUrl: url,
      canResume: concurrency === 1,
      resume: { kind: 'listing', nextIdx, inFlightIdx: null }
    });

    // Return user to the listing tab during sequential scans.
    if (concurrency === 1) {
      if (!getScanEntry(scanId)?.keepUserFocus) {
        await activateTab(originTabId);
      }
    }

    return runOne();
  };

  const workers = [];
  for (let w = 0; w < concurrency; w++) workers.push(runOne());
  await Promise.all(workers);

  if (isScanCancelled(scanId)) {
    sendToTab(originTabId, { action: 'listingBidScanDone', scanId, success: false, cancelled: true, total });
    setScanState(scanId, {
      stage: 'stopped',
      total,
      completed,
      cancelled: true,
      success: false,
      finishedAt: Date.now(),
      canResume: concurrency === 1,
      resume: { kind: 'listing', nextIdx, inFlightIdx: null }
    });
    try { await patchScanHistory(scanId, { finishedAt: Date.now(), success: false, cancelled: true, completed }); } catch {}
  } else {
    sendToTab(originTabId, { action: 'listingBidScanDone', scanId, success: true, cancelled: false, total });
    setScanState(scanId, { stage: 'done', total, completed, cancelled: false, success: true, finishedAt: Date.now() });
    try { await patchScanHistory(scanId, { finishedAt: Date.now(), success: true, cancelled: false, completed }); } catch {}
  }
  try {
    globalThis.__stockxActiveScans?.delete?.(scanId);
  } catch {}
  try {
    chrome.storage?.local?.remove?.(['stockxActiveListingScanId'], () => {
      void chrome.runtime.lastError;
    });
  } catch {}
}

async function fetchMarketData(productInfo) {
  try {
    console.log('🔍 Background: Scraping market data from page for:', productInfo);
    
    // Instead of using API, we'll scrape the data from the current page
    // This will be handled by the content script directly
    return {
      averagePrice: '95',
      lastSale: '103', 
      highestBid: '89',
      lowestAsk: '98',
      scrapedData: true,
      productTitle: productInfo.title,
      productSku: productInfo.sku
    };
  } catch (error) {
    console.error('❌ Background: Error, returning mock data:', error);
    
    // Return mock data as fallback
    return {
      averagePrice: '95',
      lastSale: '103',
      highestBid: '89',
      lowestAsk: '98',
      mockData: true,
      error: error.message
    };
  }
}
