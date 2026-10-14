/* Project Lucy — tiny hash router.
 * Routes: #/home #/discover #/create #/inbox #/profile #/user/:handle #/video/:id
 * Query strings are parsed into params (e.g. #/discover?q=coffee -> {q:'coffee'}).
 * On change: unmount the current screen, mount the target into its section,
 * toggle .view/.tabbtn active states. Unknown routes fall back to #/home.
 */
const VIEW_FOR = {
  home: 'view-home',
  discover: 'view-discover',
  create: 'view-create',
  inbox: 'view-inbox',
  profile: 'view-profile',
  user: 'view-detail',
  video: 'view-detail',
};
const TAB_FOR = {
  home: 'home',
  discover: 'discover',
  create: 'create',
  inbox: 'inbox',
  profile: 'profile',
};

export function initRouter({screens}){
  const sections = {};
  for(const id of new Set(Object.values(VIEW_FOR))){
    const sec = document.getElementById(id);
    if(sec) sections[id] = sec;
  }
  const tabs = [...document.querySelectorAll('#tabbar .tabbtn')];
  const navigate = (route) => { location.hash = '#/' + route; };
  tabs.forEach((b) => b.addEventListener('click', () => navigate(b.dataset.route)));

  let current = null;

  function parse(hash){
    const clean = String(hash || '').replace(/^#\/?/, '');
    const qIndex = clean.indexOf('?');
    const pathPart = qIndex >= 0 ? clean.slice(0, qIndex) : clean;
    const query = Object.fromEntries(new URLSearchParams(qIndex >= 0 ? clean.slice(qIndex + 1) : ''));
    const parts = pathPart.split('/').filter(Boolean);
    if(parts.length === 2 && parts[0] === 'user'){
      return {name: 'user', params: {...query, handle: decodeURIComponent(parts[1])}};
    }
    if(parts.length === 2 && parts[0] === 'video'){
      return {name: 'video', params: {...query, id: decodeURIComponent(parts[1])}};
    }
    if(parts.length <= 1 && TAB_FOR[parts[0]]){
      return {name: parts[0], params: {...query}};
    }
    return null;
  }

  function setActive(viewId, tabName){
    for(const id of Object.values(sections)){
      id.classList.remove('active');
    }
    const sec = sections[viewId];
    if(sec) sec.classList.add('active');
    tabs.forEach((b) => b.classList.toggle('active', b.dataset.route === tabName));
  }

  async function render(){
    let route = parse(location.hash);
    if(!route){
      history.replaceState(null, '', '#/home');
      route = {name: 'home', params: {}};
    }
    const screen = screens ? screens[route.name] : null;
    const viewId = VIEW_FOR[route.name];

    if(current && current.screen && typeof current.screen.unmount === 'function'){
      try{ await current.screen.unmount(); }
      catch(e){ console.error('[lucy] unmount failed', e); }
    }
    current = null;

    const sectionEl = sections[viewId];
    if(!sectionEl) return;
    sectionEl.innerHTML = '';
    setActive(viewId, TAB_FOR[route.name] || '');

    if(!screen || typeof screen.mount !== 'function'){
      console.error('[lucy] no screen registered for route', route.name);
      sectionEl.innerHTML = '<div class="screen-error">This screen failed to load.</div>';
      return;
    }
    current = {screen, name: route.name};
    try{
      await screen.mount(sectionEl, route.params);
    }catch(e){
      console.error('[lucy] mount failed for route', route.name, e);
      sectionEl.innerHTML = '<div class="screen-error">Something went wrong loading this screen.</div>';
    }
  }

  window.addEventListener('hashchange', render);
  render();
  return {navigate, rerender: render};
}
