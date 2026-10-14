/* Project Lucy — application boot.
 * Waits for the repository, registers the service worker (http/https only),
 * resolves the screen modules, starts the router, and drives the inbox badge.
 * Debug handle: window.lucy = {repo, refreshInboxBadge}.
 */
import {repo} from './data/repository.js';
import {initRouter} from './router.js';

/* Screen sources: [module path, export names to try].
 * Screens expose {mount(el, params), unmount()} — as a named const
 * (e.g. `export const HomeScreen = {...}`), a default export, or direct
 * named mount/unmount exports. Candidates are tried in order; a missing
 * module renders an honest error state instead of breaking the app. */
const SCREEN_SOURCES = {
  home: [
    ['./feed.js', ['HomeScreen']],
  ],
  discover: [
    ['./discover.js', ['DiscoverScreen']],
    ['./screens/discover.js', ['DiscoverScreen']],
  ],
  create: [
    ['./create.js', ['CreateScreen']],
    ['./screens/create.js', ['CreateScreen']],
  ],
  inbox: [
    ['./inbox.js', ['InboxScreen']],
    ['./screens/inbox.js', ['InboxScreen']],
  ],
  profile: [
    ['./profile.js', ['ProfileScreen']],
    ['./screens/profile.js', ['ProfileScreen']],
  ],
  user: [
    ['./profile.js', ['ProfileScreen']],
  ],
  video: [
    ['./feed.js', ['HomeScreen']],
  ],
};

async function resolveScreen(candidates){
  for(const [path, names] of candidates){
    try{
      const mod = await import(path);
      for(const n of names){
        const s = mod[n];
        if(s && typeof s.mount === 'function') return s;
      }
      if(mod.default && typeof mod.default.mount === 'function') return mod.default;
      if(typeof mod.mount === 'function' && typeof mod.unmount === 'function') return mod;
    }catch(e){
      /* try the next candidate */
    }
  }
  return null;
}

function missingScreen(name){
  return {
    mount(elx){
      elx.innerHTML = '<div class="screen-error">This screen failed to load.</div>';
      console.error('[lucy] screen module missing for route:', name);
    },
    unmount(){},
  };
}

async function updateInboxBadge(){
  try{
    const unreadNotes = repo.getUnreadNotificationCount();
    const unreadThreads = repo.getThreads().reduce((a, t) => a + (t.unread || 0), 0);
    const total = unreadNotes + unreadThreads;
    const badge = document.getElementById('inbox-badge');
    if(!badge) return;
    badge.hidden = total <= 0;
    badge.textContent = total > 99 ? '99+' : String(total);
  }catch(e){
    /* repository not ready or DOM missing: ignore */
  }
}

async function boot(){
  try{
    await repo.ready;
  }catch(e){
    console.error('[lucy] data layer failed to initialize', e);
    const home = document.getElementById('view-home');
    if(home){
      home.classList.add('active');
      home.innerHTML = '<div class="boot-error">Lucy could not start. Check your connection and reload.</div>';
    }
    return;
  }

  if('serviceWorker' in navigator && /^https?:$/.test(location.protocol)){
    try{
      await navigator.serviceWorker.register('sw.js');
    }catch(e){
      console.warn('[lucy] service worker registration failed', e);
    }
  }

  const screens = {};
  for(const [name, candidates] of Object.entries(SCREEN_SOURCES)){
    screens[name] = (await resolveScreen(candidates)) || missingScreen(name);
  }

  initRouter({screens});

  if(!location.hash) location.hash = '#/home';

  updateInboxBadge();
  repo.onMessage(() => updateInboxBadge());

  window.lucy = {repo, refreshInboxBadge: updateInboxBadge};
}

boot();
