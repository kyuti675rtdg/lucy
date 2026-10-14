#!/usr/bin/env node
/* Project Lucy — deterministic seed-data generator.
 * Zero dependencies. All randomness comes from a mulberry32 PRNG seeded
 * with 20261014, so re-running produces byte-identical JSON output.
 * Writes: data/seed_users.json, data/seed_videos.json,
 *          data/seed_comments.json, data/seed_inbox.json, data/seed_graph.json
 */
'use strict';
const fs = require('fs');
const path = require('path');

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261014);
const ri = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const pad2 = (n) => String(n).padStart(2, '0');
const pad4 = (n) => String(n).padStart(4, '0');

const MIN = 60000;
const T_MIN = Date.UTC(2026, 8, 20, 0, 0, 0);   // 2026-09-20
const T_MAX = Date.UTC(2026, 9, 14, 23, 59, 0); // 2026-10-14
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const randTime = (from, to) => from + Math.floor(rand() * (to - from + 1));
const clampMax = (ms) => Math.min(ms, T_MAX);

/* ---------------------------------------------------------------- users */
const VERIFIED = new Set(['u01', 'u05', 'u09', 'u11', 'u13', 'u17', 'u21', 'u27']);
const ETHIOPIAN = new Set(['u01','u02','u05','u06','u09','u10','u15','u17','u18','u19','u21','u25','u29']);

const USER_DEFS = [
  { id:'u01', handle:'selam.brews', displayName:'Selam Tesfaye', altName:'ሰላም ተስፋዬ', category:'Coffee', location:'Addis Ababa',
    bio:'Brewing Ethiopian coffee culture, one video at a time ☕ | Addis Ababa | jebena enthusiast' },
  { id:'u02', handle:'dawit.codes', displayName:'Dawit Haile', altName:'ዳዊት ኃይሌ', category:'Tech', location:'Addis Ababa',
    bio:'Software engineer building in public | React Native, coffee-powered code | Addis → the world' },
  { id:'u03', handle:'marcus.builds', displayName:'Marcus Reed', category:'Tech', location:'Austin',
    bio:'Home lab tinkerer | I break things so you don\'t have to | setup videos every week' },
  { id:'u04', handle:'priya.in.tech', displayName:'Priya Nair', category:'Tech', location:'Bengaluru',
    bio:'Developer advocate | VS Code wizard | making coding less scary, one shortcut at a time' },
  { id:'u05', handle:'henok.laughs', displayName:'Henok Alemu', altName:'ሄኖክ አለሙ', category:'Comedy', location:'Addis Ababa',
    bio:'Habesha comedy that hits home 😄 | sketches every Tue & Fri | your daily laugh dealer' },
  { id:'u06', handle:'tigist.daily', displayName:'Tigist Bekele', altName:'ትግስት በቀለ', category:'Comedy', location:'Addis Ababa',
    bio:'POV queen of Addis | relatable chaos | my mom is my biggest fan and harshest critic' },
  { id:'u07', handle:'leo.makes.you.laugh', displayName:'Leo Martins', category:'Comedy', location:'São Paulo',
    bio:'Brazilian sketch comedian | awkward moments, dramatized | subtitles included, dignity not guaranteed' },
  { id:'u08', handle:'sofia.sketches', displayName:'Sofia Rossi', category:'Comedy', location:'Milan',
    bio:'Italian nonna-approved comedy 🇮🇹 | sketches about family, food & drama | ciao!' },
  { id:'u09', handle:'yared.sings', displayName:'Yared Assefa', altName:'ያሬድ አሰፋ', category:'Music', location:'Addis Ababa',
    bio:'Singer-songwriter | masinko meets modern | new single "Addis Nights" out now 🎶' },
  { id:'u10', handle:'mahlet.melody', displayName:'Mahlet Girma', altName:'ማህሌት ግርማ', category:'Music', location:'Addis Ababa',
    bio:'Pianist with a soft spot for tizita 🎹 | covers & originals | playing your requests' },
  { id:'u11', handle:'nova.beats', displayName:'Nova Chen', category:'Music', location:'Seoul',
    bio:'Producer turning everyday sounds into beats 🎛️ | collabs open | headphones on, world off' },
  { id:'u12', handle:'diego.strings', displayName:'Diego Fuentes', category:'Music', location:'Madrid',
    bio:'Flamenco guitarist | one take, no edits | sunrise sessions every Sunday 🌅' },
  { id:'u13', handle:'amara.lives', displayName:'Amara Okafor', category:'Lifestyle', location:'Lagos',
    bio:'Wellness & slow living in Lagos ✨ | 5am club president | romanticizing ordinary days' },
  { id:'u14', handle:'emma.wanders', displayName:'Emma Johansson', category:'Lifestyle', location:'Stockholm',
    bio:'Cabin weekends & fika breaks 🌲 | Swedish slow living | currently offline (not really)' },
  { id:'u15', handle:'selamawit.home', displayName:'Selamawit Tadesse', altName:'ሰላማዊት ታደሰ', category:'Lifestyle', location:'Addis Ababa',
    bio:'Addis apartment glow-ups on a budget 🏠 | thrift queen | DIY or die' },
  { id:'u16', handle:'jack.minimal', displayName:'Jack Thompson', category:'Lifestyle', location:'London',
    bio:'Minimalist | I own 47 things and count them yearly | less stuff, more life' },
  { id:'u17', handle:'bereket.buna', displayName:'Bereket Worku', altName:'በረከት ወርቁ', category:'Coffee', location:'Addis Ababa',
    bio:'Guardian of the buna ceremony ☕🔥 | third-generation coffee farmer | three rounds or nothing' },
  { id:'u18', handle:'hana.pours', displayName:'Hana Teshome', altName:'ሃና ተሾመ', category:'Coffee', location:'Hawassa',
    bio:'Pour-over devotee by Lake Hawassa 🌅 | V60 nerd | chasing the perfect extraction' },
  { id:'u19', handle:'fitsum.roasts', displayName:'Fitsum Gebru', altName:'ፍጹም ገብሩ', category:'Coffee', location:'Addis Ababa',
    bio:'Coffee roaster | first crack is my love language 🔥 | fresh batches every Friday' },
  { id:'u20', handle:'clara.cafe', displayName:'Clara Dubois', category:'Coffee', location:'Paris',
    bio:'Parisian café crawler 🇫🇷 | 200+ cafés reviewed | in search of the perfect crème' },
  { id:'u21', handle:'nahom.moves', displayName:'Nahom Tesfay', altName:'ናሆም ተስፋዬ', category:'Dance', location:'Addis Ababa',
    bio:'Eskista to the world 💃 | choreographer | if the shoulders don\'t move, it doesn\'t count' },
  { id:'u22', handle:'zoe.dances', displayName:'Zoe Carter', category:'Dance', location:'Los Angeles',
    bio:'LA choreographer | tutorials every week | dance like everyone\'s watching (they are)' },
  { id:'u23', handle:'kenji.groove', displayName:'Kenji Sato', category:'Dance', location:'Tokyo',
    bio:'Popper from Tokyo 🤖 | neon sessions in Shibuya | robot with a heartbeat' },
  { id:'u24', handle:'prof.weiss', displayName:'Dr. Alan Weiss', category:'Education', location:'Berlin',
    bio:'Physics professor | explaining the universe in 30 seconds 🌤️ | curiosity required' },
  { id:'u25', handle:'meron.learns', displayName:'Meron Alemayehu', altName:'መሮን አለማየሁ', category:'Education', location:'Addis Ababa',
    bio:'Teaching Amharic to the world 📚 | one word at a time | coffee vocabulary included' },
  { id:'u26', handle:'raj.explains', displayName:'Raj Patel', category:'Education', location:'Mumbai',
    bio:'Money, simply explained 📈 | finance for the rest of us | your future self says thanks' },
  { id:'u27', handle:'iris.paints', displayName:'Iris Moreau', category:'Art', location:'Amsterdam',
    bio:'Oil painter | Amsterdam canals at golden hour 🎨 | process videos daily' },
  { id:'u28', handle:'tomas.sculpts', displayName:'Tomás Silva', category:'Art', location:'Lisbon',
    bio:'Marble sculptor 🗿 | day 47 of the current piece | patience is the real tool' },
  { id:'u29', handle:'abenezer.inks', displayName:'Abenezer Mekonnen', altName:'አቤኔዘር መኮንን', category:'Art', location:'Addis Ababa',
    bio:'Ethiopic calligrapher 🖋️ | every letter is architecture | ink made by hand' },
  { id:'u30', handle:'lily.creates', displayName:'Lily Zhang', category:'Art', location:'Vancouver',
    bio:'Miniature artist 🏠 | tiny worlds, huge patience | 72 hours in 60 seconds' },
];

const users = USER_DEFS.map((u) => {
  const verified = VERIFIED.has(u.id);
  const followers = u.id === 'u01' ? ri(30000, 60000)
    : verified ? ri(150000, 2500000) : ri(1200, 120000);
  const following = ri(80, 900);
  const likes = Math.round(followers * (8 + rand() * 17));
  const hue = ri(0, 360);
  const user = { id: u.id, handle: u.handle, displayName: u.displayName };
  if (u.altName) user.altName = u.altName;
  Object.assign(user, {
    bio: u.bio,
    avatar: 'assets/avatars/' + u.id + '.svg',
    verified, followers, following, likes,
    category: u.category, location: u.location, hue,
  });
  return user;
});

const userById = Object.fromEntries(USER_DEFS.map((u) => [u.id, u]));
const pickUserExcluding = (...excluded) => {
  const pool = USER_DEFS.filter((u) => !excluded.includes(u.id));
  return pick(pool);
};

/* --------------------------------------------------------------- videos */
const CATS = [].concat(
  Array(4).fill('Tech'), Array(4).fill('Comedy'), Array(4).fill('Music'),
  Array(4).fill('Lifestyle'), Array(4).fill('Coffee'),
  Array(3).fill('Dance'), Array(3).fill('Education'), Array(4).fill('Art')
);

const VIDEO_DEFS = [
  { caption:'POV: your espresso machine gets a firmware update ☕💻\nUnboxing the smart brewer that texts me when my shot is ready.\nCoffee + tech = my entire personality',
    hashtags:['coffeetech','smartbrew','unboxing','techreview','espresso'], audioTitle:'Neon Circuit', audioArtist:'Volt Avenue' },
  { caption:'I built a coffee-ordering app in 24 hours ☕\nReact Native, one API, zero sleep.\nFull build log in the comments if you want the repo',
    hashtags:['buildinpublic','reactnative','appdev','coding','24hourchallenge'], audioTitle:'Compile Time', audioArtist:'Null Pointer' },
  { caption:'My home lab finally runs silent 🤫\nSwapped every fan, undervolted the GPU, temps still perfect.\nTour in part 2',
    hashtags:['homelab','pctech','setuptour','techtok'], audioTitle:'Server Room Hum', audioArtist:'Logic Gate' },
  { caption:'5 VS Code extensions that changed my workflow\nNumber 3 saves me an hour a day.\nWhich one are you missing?',
    hashtags:['vscode','codingtips','developer','programming','techtips'], audioTitle:'Firmware Dreams', audioArtist:'Cache Flow' },
  { caption:'When the waiter says "enjoy your meal" and you say "you too" 💀\nI\'ve thought about this every day for 6 years.\nTag someone who does this',
    hashtags:['relatable','comedy','awkwardmoments','habesha'], audioTitle:'Silly Bass Drop', audioArtist:'Chuckle Bros' },
  { caption:'Ethiopian moms when you say you\'re full 😭\n"Just one more injera, you\'re too skinny"\nThe plate refills itself, I swear',
    hashtags:['habeshacomedy','ethiopianmom','relatable','comedy'], audioTitle:'Banana Peel Blues', audioArtist:'The Pranksters' },
  { caption:'POV: you wave back at someone who wasn\'t waving at you\nI have now moved to a new city.\nNew name, new life',
    hashtags:['awkward','povcomedy','relatable','sketch'], audioTitle:'Laugh Track 3000', audioArtist:'Giggle Factory' },
  { caption:'Italian grandma reviews my cooking: a tragedy in 3 acts 🍝\nAct 1: silence. Act 2: sighing. Act 3: she remakes it.\nNonna always wins',
    hashtags:['italiancomedy','nonna','cookingfail','sketch'], audioTitle:'Snort Symphony', audioArtist:'Chuckle Wagon' },
  { caption:'New single "Addis Nights" — masinko intro 🌙\nWrote this watching the city lights from Entoto.\nFull song link in bio',
    hashtags:['ethiopianmusic','originalsong','masinko','newmusic'], audioTitle:'Addis Nights', audioArtist:'Yared Assefa' },
  { caption:'Tizita on piano hits different 🎹\nMy grandmother\'s favorite song, my version.\nFor everyone missing home tonight',
    hashtags:['tizita','piano','ethiopianmusic','emotional'], audioTitle:'Tizita Strings', audioArtist:'Ethio Collective' },
  { caption:'Made a beat from my coffee grinder sounds ☕🎛️\nSampling everyday noise, part 12.\nWould you listen to the full track?',
    hashtags:['beatmaking','sampling','producerlife','lofi'], audioTitle:'Velvet Static', audioArtist:'Nova Chen' },
  { caption:'Flamenco guitar + sunrise in Madrid 🌅\nOne take, no edits, just morning light.\nOlé?',
    hashtags:['flamenco','guitar','spain','acoustic'], audioTitle:'Madrid Sunrise', audioArtist:'Diego Fuentes' },
  { caption:'My 5am Lagos reset routine ✨\nJournal, stretch, no phone for one hour.\nSmall habits, big peace',
    hashtags:['morningroutine','selfcare','lagos','wellness'], audioTitle:'Slow Mornings', audioArtist:'Linen & Light' },
  { caption:'Cabin weekend in the Swedish woods 🌲\nNo wifi, one book, endless fika.\nThis is what recharging looks like',
    hashtags:['cabinlife','slowweekend','sweden','cozy'], audioTitle:'Golden Hour Waltz', audioArtist:'The Daydreamers' },
  { caption:'Organizing my Addis apartment on a budget 🏠\nThrift finds + DIY shelves.\nTotal cost: less than one dinner out',
    hashtags:['homeorganization','diy','addisababa','budgetliving'], audioTitle:'Cotton Skies', audioArtist:'Paper Planes' },
  { caption:'I own 47 things. Here\'s everything. 🧳\nTwo years of minimalism, zero regrets.\nFreedom looks like an empty closet',
    hashtags:['minimalism','simpleliving','declutter','lessismore'], audioTitle:'Sunday Reset', audioArtist:'Soft Focus' },
  { caption:'Full buna ceremony, start to finish ☕🔥\nRoast, grind, brew in the jebena — three rounds, as tradition demands.\nPopcorn\'s ready, who\'s joining?',
    hashtags:['bunaceremony','ethiopiancoffee','jebena','coffeeculture'], audioTitle:'Buna Ceremony', audioArtist:'Jebena Trio' },
  { caption:'Pour-over at Lake Hawassa sunrise 🌅\nV60, light roast, 92 degrees.\nBest office view in the world',
    hashtags:['pourover','v60','coffeemorning','hawassa'], audioTitle:'Roast & Rumble', audioArtist:'Bean Brigade' },
  { caption:'Roasting day: from green to golden brown 🔥\nListen for first crack — that\'s the sweet spot.\nFresh batch drops Friday',
    hashtags:['coffeeroasting','specialtycoffee','firstcrack','roastery'], audioTitle:'Jebena Boil', audioArtist:'Addis Acoustic' },
  { caption:'Paris café crawl: 5 arrondissements, 12 espressos 🇫🇷\nRanking every shot from "meh" to "magnifique".\nNumber 4 changed my life',
    hashtags:['pariscafes','espresso','cafecrawl','coffee'], audioTitle:'Espresso Yourself', audioArtist:'Café Noir' },
  { caption:'Eskista challenge — shoulder game STRONG 💪\nTraditional moves, modern beat.\nDuet this if you can keep up',
    hashtags:['eskista','ethiopiandance','dancechallenge','duetthis'], audioTitle:'Floor Tremor', audioArtist:'DJ Selam' },
  { caption:'New choreo to "Midnight Pulse" 🌙\nTook 6 hours to learn, 60 seconds to perform.\nTutorial drops tomorrow',
    hashtags:['choreography','dancetutorial','hiphop','la'], audioTitle:'Midnight Pulse', audioArtist:'Bassline Benny' },
  { caption:'Robot meets tradition — Tokyo street session 🤖\nPopping under the neon lights of Shibuya.\nWhich style wins?',
    hashtags:['popping','streetdance','tokyo','shibuya'], audioTitle:'Neon Shuffle', audioArtist:'Groove Theory' },
  { caption:'Why the sky is blue in 30 seconds 🌤️\nRayleigh scattering, explained with a flashlight.\nPhysics is beautiful',
    hashtags:['physics','learnontiktok','science','explainer'], audioTitle:'Brain Waves', audioArtist:'Study Hall' },
  { caption:'Amharic in 30 seconds: coffee words ☕\nBuna = coffee, jebena = pot, rekebot = table.\nSave this for your next ceremony',
    hashtags:['learnamharic','amharic','ethiopia','language'], audioTitle:'Curious Minds', audioArtist:'The Professors' },
  { caption:'Compound interest: the 8th wonder, visualized 📈\nStart with $10 a month at 20.\nYour future self says thanks',
    hashtags:['finance','moneytips','investing','learn'], audioTitle:'Eureka Moment', audioArtist:'Lab Coats' },
  { caption:'Painting the Amsterdam canals at golden hour 🎨\nOne brush, three colors, zero plan.\nWatch it come alive',
    hashtags:['oilpainting','amsterdam','artprocess','painting'], audioTitle:'Canvas Whispers', audioArtist:'Palette Knife' },
  { caption:'Carving marble: day 47 of the sculpture 🗿\nEvery chip gets me closer.\nPatience is the real tool',
    hashtags:['sculpture','marble','artprocess','lisbon'], audioTitle:'Ink & Echo', audioArtist:'Mono Muse' },
  { caption:'Ethiopic calligraphy: writing "ፍቅር" (love) 🖋️\nEach letter is a little architecture.\nInk: homemade, patience: infinite',
    hashtags:['ethiopic','calligraphy','amharic','handlettering'], audioTitle:'Color Theory', audioArtist:'Spectrum Six' },
  { caption:'Tiny clay café: full miniature build 🏠\nEspresso machine the size of a coin.\n72 hours in 60 seconds',
    hashtags:['miniature','clayart','tinythings','artprocess'], audioTitle:'Clay Hands', audioArtist:'Kiln Folk' },
];

/* video timestamps first (comments need them) */
const videoTimes = {};
VIDEO_DEFS.forEach((vd, idx) => {
  videoTimes['v' + pad2(idx + 1)] = randTime(T_MIN, T_MAX);
});

/* -------------------------------------------------------------- comments */
const POOLS = {
  praise: [
    'This is incredible 🔥', 'Instant follow, this is so good', 'How is this not viral yet??',
    'The algorithm finally did something right', 'Watched this 5 times already',
    'This deserves way more views', 'Okay this is my favorite thing today',
    'The talent here is unreal', 'Saving this forever', 'POV: you just found your new favorite creator',
    'The dedication in this is unreal', 'This popped up at exactly the right moment',
  ],
  questions: [
    'Wait how did you do that??', 'Tutorial please 🙏', 'What camera are you using?',
    'How long did this take to make?', 'Where was this filmed?', 'Can you do a part 2?',
    'What\'s the song in the background?', 'Is this your original idea? Genius either way',
    'How often do you post? Need more of this', 'Do you take requests?',
  ],
  jokes: [
    'Me pretending I could ever do this 😭', 'My feed is just you now and I\'m not mad',
    'Bro really said "watch this" 💀', 'The confidence?? I could never',
    'Meanwhile I\'m eating cereal in bed', 'Nobody: ... absolutely nobody: ... me: *sends to group chat*',
  ],
  amharic: [
    'በትም ይቀልጣል!', 'በጣም ቆንጆ!', 'አሪፍ ነው 👏', 'እንኳን ደስ አለዎት!',
    'በጣም እወደዋለሁ ❤️', 'ልቤን ነክቶኛል', 'ውድድድድድ! 🔥', 'ገላገል ነው!',
  ],
  Tech: [
    'The setup tour I didn\'t know I needed', 'My wallet is crying watching this',
    'Specs?? Drop the specs!', 'This is the cleanest cable management I\'ve seen',
    'Okay but does it run Crysis', 'Productivity just went up 300%',
    'The RGB alone adds 20fps, scientifically proven', 'Bookmarking this for my next build',
  ],
  Comedy: [
    'I\'M CRYING 😭😭', 'The timing on this is perfect', 'This lives in my head rent free now',
    'How are you so funny without trying', 'Sent this to 5 people already',
    'The rewatch value on this is insane', 'My stomach hurts from laughing',
  ],
  Music: [
    'That voice!! Chills literally', 'This is going on my playlist immediately',
    'The instrumental break?? Insane', 'I\'ve had this on repeat all morning',
    'When\'s the full version dropping?', 'Goosebumps. Actual goosebumps.',
    'The production quality is studio-level', 'This needs to be on the radio',
  ],
  Lifestyle: [
    'This is the reset I needed to see', 'Your home is goals honestly',
    'Saving this for my Sunday routine', 'The aesthetic is immaculate',
    'Okay I\'m reorganizing my whole life now', 'Simple living done right 👏',
  ],
  Coffee: [
    'The jebena pour at the end 😍', 'Nothing beats a proper buna ceremony',
    'That roast color is PERFECT', 'I can smell this through the screen',
    'Ethiopian coffee culture is unmatched ☕', 'Three rounds? I\'m staying for all of them',
    'Popcorn with buna is elite, fight me', 'Teaching the world, one cup at a time',
  ],
  Dance: [
    'THE FOOTWORK 🔥🔥', 'How do your knees survive this', 'This choreo is insane',
    'Teaching a class when??', 'The shoulder work!! Respect', 'The control in this is unreal',
    'Duet sent — I tried my best 😅', 'This belongs on a stage',
  ],
  Education: [
    'Learned more in 30 seconds than in school', 'Why wasn\'t it explained like this before',
    'Taking notes fr', 'My brain just grew three sizes', 'Can you cover black holes next?',
    'Finally, an explanation that makes sense', 'Sending this to my study group',
  ],
  Art: [
    'The process is as beautiful as the piece', 'Watching paint dry was never this good',
    'The detail work is mind-blowing', 'This belongs in a gallery',
    'Mesmerizing from start to finish', 'The patience this takes... wow',
  ],
  repliesAuthor: [
    'Thank you so much! 🙏', 'Haha glad you liked it!', 'Part 2 is coming 👀',
    'Appreciate you!', 'Wait till you see the next one', 'You\'re the best, thank you!',
  ],
  repliesUser: [
    'Right??', 'Exactly what I was thinking', 'This comment wins', 'LMAO', '+1',
    'Came here to say this', 'Underrated comment',
  ],
};

function pickCommentText(cat, commenterId) {
  const r = rand();
  if (ETHIOPIAN.has(commenterId) && r < 0.22) return pick(POOLS.amharic);
  if (r < 0.55) return pick(POOLS[cat]);
  if (r < 0.75) return pick(POOLS.praise);
  if (r < 0.90) return pick(POOLS.questions);
  return pick(POOLS.jokes);
}

const comments = [];
let cSeq = 0;
const nextCid = () => 'c' + pad4(++cSeq);

VIDEO_DEFS.forEach((vd, idx) => {
  const n = idx + 1;
  const vid = 'v' + pad2(n);
  const authorId = 'u' + pad2(n);
  const cat = CATS[idx];
  const vTime = videoTimes[vid];
  const tops = [];
  const count = ri(5, 15);
  for (let i = 0; i < count; i++) {
    const commenter = pickUserExcluding(authorId);
    const createdAt = iso(clampMax(vTime + ri(5, 3 * 24 * 60) * MIN));
    tops.push({
      id: nextCid(), videoId: vid, userId: commenter.id,
      text: pickCommentText(cat, commenter.id), parentId: null,
      likes: Math.floor(rand() * rand() * 1500), createdAt,
    });
  }
  /* ~30% of videos get 1–3 nested replies (author or fellow viewers) */
  if (rand() < 0.30 && tops.length > 0) {
    const nReplies = ri(1, 3);
    for (let r = 0; r < nReplies; r++) {
      const parent = pick(tops);
      let uid, text;
      if (rand() < 0.6) {
        uid = authorId; // author reply
        text = (ETHIOPIAN.has(authorId) && rand() < 0.3) ? pick(POOLS.amharic) : pick(POOLS.repliesAuthor);
      } else {
        const replier = pickUserExcluding(authorId, parent.userId);
        uid = replier.id;
        text = (ETHIOPIAN.has(uid) && rand() < 0.25) ? pick(POOLS.amharic) : pick(POOLS.repliesUser);
      }
      comments.push({
        id: nextCid(), videoId: vid, userId: uid, text, parentId: parent.id,
        likes: Math.floor(rand() * rand() * 300),
        createdAt: iso(clampMax(Date.parse(parent.createdAt) + ri(5, 24 * 60) * MIN)),
      });
    }
  }
  comments.push(...tops);
});

const commentCountByVideo = {};
comments.forEach((c) => { commentCountByVideo[c.videoId] = (commentCountByVideo[c.videoId] || 0) + 1; });

/* -------------------------------------------------- assemble videos */
const videos = VIDEO_DEFS.map((vd, idx) => {
  const n = idx + 1;
  const vid = 'v' + pad2(n);
  const views = ri(5000, 4000000);
  const likes = Math.round(views * (0.04 + rand() * 0.05));
  return {
    id: vid,
    userId: 'u' + pad2(n),
    caption: vd.caption,
    hashtags: vd.hashtags,
    audioTitle: vd.audioTitle,
    audioArtist: vd.audioArtist,
    views,
    likes,
    comments: commentCountByVideo[vid] || 0,
    shares: Math.round(likes * (0.05 + rand() * 0.10)),
    bookmarks: Math.round(likes * (0.08 + rand() * 0.12)),
    durationSec: 10 + ((n - 1) % 6),
    file: 'assets/videos/' + vid + '.mp4',
    poster: 'assets/posters/' + vid + '.jpg',
    createdAt: iso(videoTimes[vid]),
  };
});

/* ----------------------------------------------------------------- inbox */
const notifications = [
  { id:'n01', type:'system', actorId:null, text:'Welcome to Lucy — your offline studio is ready.', videoId:null, createdAt:'2026-09-21T09:00:00Z', read:true },
  { id:'n02', type:'like', actorId:'u05', text:'henok.laughs liked your video', videoId:'v01', createdAt:'2026-10-02T14:22:00Z', read:true },
  { id:'n03', type:'like', actorId:'u17', text:'bereket.buna liked your video', videoId:'v01', createdAt:'2026-10-05T09:41:00Z', read:true },
  { id:'n04', type:'like', actorId:'u09', text:'yared.sings liked your video', videoId:'v01', createdAt:'2026-10-13T20:15:00Z', read:false },
  { id:'n05', type:'like', actorId:'u11', text:'nova.beats liked your video', videoId:'v01', createdAt:'2026-10-08T11:03:00Z', read:true },
  { id:'n06', type:'comment', actorId:'u06', text:'tigist.daily commented: "The smart brewer texting you 😭 I need this"', videoId:'v01', createdAt:'2026-10-06T16:30:00Z', read:true },
  { id:'n07', type:'comment', actorId:'u21', text:'nahom.moves commented: "Coffee + tech = genius combo ☕💻"', videoId:'v01', createdAt:'2026-10-14T08:12:00Z', read:false },
  { id:'n08', type:'comment', actorId:'u18', text:'hana.pours commented: "በትም ይቀልጣል! 🔥"', videoId:'v01', createdAt:'2026-10-09T13:55:00Z', read:true },
  { id:'n09', type:'follow', actorId:'u11', text:'nova.beats started following you', videoId:null, createdAt:'2026-10-07T10:20:00Z', read:true },
  { id:'n10', type:'follow', actorId:'u13', text:'amara.lives started following you', videoId:null, createdAt:'2026-10-10T18:44:00Z', read:true },
  { id:'n11', type:'follow', actorId:'u27', text:'iris.paints started following you', videoId:null, createdAt:'2026-10-13T21:37:00Z', read:false },
  { id:'n12', type:'follow', actorId:'u25', text:'meron.learns started following you', videoId:null, createdAt:'2026-10-14T07:58:00Z', read:false },
];

let mSeq = 0;
const nextMid = () => 'm' + pad4(++mSeq);
function buildThread(id, userId, script) {
  return {
    id, userId,
    messages: script.map(([fromMe, text, createdAt]) => ({ id: nextMid(), threadId: id, fromMe, text, createdAt })),
  };
}

const threads = [
  buildThread('t1', 'u17', [
    [false, 'Selam! Loved your roasting video 🔥', '2026-10-11T10:05:00Z'],
    [true, 'Thank you Bereket! Your ceremony series is the reason I started', '2026-10-11T10:12:00Z'],
    [false, 'Haha that means a lot. Quick idea — collab video? Traditional vs modern brew?', '2026-10-11T10:20:00Z'],
    [true, 'YES. Jebena vs my espresso machine, side by side', '2026-10-11T10:31:00Z'],
    [false, 'Perfect. I can bring the popcorn, you bring the drama 😄', '2026-10-11T10:33:00Z'],
    [true, 'Deal. Saturday at your place? I\'ll bring my camera', '2026-10-11T10:40:00Z'],
    [false, 'Saturday works. Come hungry — three rounds minimum ☕', '2026-10-11T10:45:00Z'],
    [true, 'Wouldn\'t miss it. See you at 10!', '2026-10-11T10:52:00Z'],
  ]),
  buildThread('t2', 'u09', [
    [true, 'Yared! Your new single is stuck in my head', '2026-10-12T09:00:00Z'],
    [false, 'Haha thank you! Means a lot coming from you', '2026-10-12T09:15:00Z'],
    [true, 'Would you be open to me using 15 seconds in my next coffee video?', '2026-10-12T09:18:00Z'],
    [false, 'Of course! Which part were you thinking?', '2026-10-12T09:25:00Z'],
    [true, 'The masinko intro — it fits a sunrise brewing scene perfectly', '2026-10-12T09:30:00Z'],
    [false, 'That\'s my favorite part too. I\'ll send you the clean stem', '2026-10-12T09:44:00Z'],
    [true, 'You\'re the best. Full credit + tag, obviously', '2026-10-12T09:50:00Z'],
    [false, 'Appreciated 🙏 Just send me the draft before posting?', '2026-10-12T09:58:00Z'],
    [true, 'Absolutely. Draft by Friday', '2026-10-12T10:05:00Z'],
    [false, 'Can\'t wait to see it', '2026-10-12T10:12:00Z'],
  ]),
  buildThread('t3', 'u21', [
    [false, 'Selam! Coffee festival next month — I\'m choreographing the opening', '2026-10-13T14:00:00Z'],
    [true, 'No way! That\'s huge, congratulations', '2026-10-13T14:07:00Z'],
    [false, 'Thanks! Want to do a live brewing demo between sets?', '2026-10-13T14:10:00Z'],
    [true, 'I\'d love to. I can do a full ceremony on stage?', '2026-10-13T14:22:00Z'],
    [false, 'That would be iconic. Crowd gets coffee, I get dancers, everybody wins', '2026-10-13T14:25:00Z'],
    [true, 'Haha exactly. Send me the schedule when it\'s locked', '2026-10-13T14:31:00Z'],
    [false, 'Will do. This is going to be special ☕💃', '2026-10-13T14:40:00Z'],
  ]),
  /* t4 ends with 2 unread incoming messages */
  buildThread('t4', 'u05', [
    [true, 'Henok your latest sketch had me crying 😭', '2026-10-13T19:00:00Z'],
    [false, 'Haha mission accomplished', '2026-10-13T19:05:00Z'],
    [true, 'Serious question — want to film one at my café corner?', '2026-10-13T19:09:00Z'],
    [false, 'A barista comedy?? I\'m listening...', '2026-10-13T19:14:00Z'],
    [true, 'Customer orders a "decaf jebena" and you play the offended elder 😄', '2026-10-13T19:20:00Z'],
    [false, 'STOP that\'s perfect. I\'m writing it down', '2026-10-13T19:26:00Z'],
    [true, 'We film Thursday? I\'ll have the popcorn ready', '2026-10-13T19:30:00Z'],
    [false, 'Thursday confirmed. Bringing my cousin as the "customer" 🎬', '2026-10-14T08:15:00Z'],
    [false, 'Also — can we do a part 2 with the espresso machine??', '2026-10-14T08:20:00Z'],
  ]),
];

/* ----------------------------------------------------------------- graph */
const follows = [];
const followSeen = new Set();
const addFollow = (a, b) => {
  const k = a + '>' + b;
  if (a === b || followSeen.has(k)) return false;
  followSeen.add(k); follows.push([a, b]); return true;
};
['u05','u09','u11','u13','u17','u18','u21','u25','u27','u29'].forEach((f) => addFollow('u01', f));
let interAdded = 0, guard = 0;
while (interAdded < 20 && guard++ < 1000) {
  const a = pickUserExcluding('u01').id, b = pickUserExcluding('u01').id;
  if (addFollow(a, b)) interAdded++;
}

const likeVids = new Set();
while (likeVids.size < 15) likeVids.add('v' + pad2(ri(2, 30)));
const likes = [...likeVids].map((v) => ['u01', v]);

const bookmarkVids = new Set();
while (bookmarkVids.size < 4) bookmarkVids.add('v' + pad2(ri(2, 30)));
const bookmarks = [...bookmarkVids].map((v) => ['u01', v]);

/* ----------------------------------------------------------------- write */
const outDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(outDir, { recursive: true });
const write = (name, obj) => fs.writeFileSync(path.join(outDir, name), JSON.stringify(obj, null, 2) + '\n');

write('seed_users.json', users);
write('seed_videos.json', videos);
write('seed_comments.json', comments);
write('seed_inbox.json', { notifications, threads });
write('seed_graph.json', { follows, likes, bookmarks });

const nested = comments.filter((c) => c.parentId).length;
console.log('seed written: ' + users.length + ' users, ' + videos.length + ' videos, ' +
  comments.length + ' comments (' + nested + ' nested replies), ' +
  notifications.length + ' notifications, ' + threads.length + ' threads (' +
  threads.reduce((s, t) => s + t.messages.length, 0) + ' messages), ' +
  follows.length + ' follows, ' + likes.length + ' likes, ' + bookmarks.length + ' bookmarks');
