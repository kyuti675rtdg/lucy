#!/usr/bin/env node
/* Project Lucy — seed data integrity checker.
 * Parses all five JSON files and verifies cross-references.
 * Prints PASS/FAIL per check. Exit code 0 = all pass, 1 = any fail.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const read = (name) => JSON.parse(fs.readFileSync(path.join(dataDir, name), 'utf8'));

const users = read('seed_users.json');
const videos = read('seed_videos.json');
const comments = read('seed_comments.json');
const inbox = read('seed_inbox.json');
const graph = read('seed_graph.json');

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? ' — ' + detail : ''));
};

const userIds = new Set(users.map((u) => u.id));
const videoIds = new Set(videos.map((v) => v.id));
const commentIds = new Map(comments.map((c) => [c.id, c]));

/* 1. exact counts */
check('30 users', users.length === 30, 'found ' + users.length);
check('30 videos', videos.length === 30, 'found ' + videos.length);
check('>=150 comments', comments.length >= 150, 'found ' + comments.length);

/* 2. video -> user refs */
const badVideoUser = videos.filter((v) => !userIds.has(v.userId));
check('video.userId exists in users', badVideoUser.length === 0,
  badVideoUser.length ? 'bad: ' + badVideoUser.map((v) => v.id).join(',') : videos.length + ' videos checked');

/* 3. comment -> video/user refs */
const badCommentVideo = comments.filter((c) => !videoIds.has(c.videoId));
const badCommentUser = comments.filter((c) => !userIds.has(c.userId));
check('comment.videoId exists in videos', badCommentVideo.length === 0,
  badCommentVideo.length ? 'bad: ' + badCommentVideo.map((c) => c.id).join(',') : comments.length + ' comments checked');
check('comment.userId exists in users', badCommentUser.length === 0,
  badCommentUser.length ? 'bad: ' + badCommentUser.map((c) => c.id).join(',') : comments.length + ' comments checked');

/* 4. parentId refs: exists + same video */
const badParent = comments.filter((c) => {
  if (!c.parentId) return false;
  const p = commentIds.get(c.parentId);
  return !p || p.videoId !== c.videoId;
});
check('comment.parentId exists and is same-video', badParent.length === 0,
  badParent.length ? 'bad: ' + badParent.map((c) => c.id).join(',') :
    comments.filter((c) => c.parentId).length + ' nested replies checked');

/* 5. video.comments matches actual comment count */
const actualByVideo = {};
comments.forEach((c) => { actualByVideo[c.videoId] = (actualByVideo[c.videoId] || 0) + 1; });
const badCounts = videos.filter((v) => v.comments !== (actualByVideo[v.id] || 0));
check('video.comments equals actual comment count', badCounts.length === 0,
  badCounts.length ? 'bad: ' + badCounts.map((v) => v.id + '(field=' + v.comments + ',actual=' + (actualByVideo[v.id] || 0) + ')').join(',') : 'all 30 match');

/* 6. notification refs */
const badNotifActor = inbox.notifications.filter((n) => n.actorId !== null && !userIds.has(n.actorId));
const badNotifVideo = inbox.notifications.filter((n) => n.videoId !== null && !videoIds.has(n.videoId));
check('notification.actorId refs exist', badNotifActor.length === 0,
  badNotifActor.length ? 'bad: ' + badNotifActor.map((n) => n.id).join(',') : inbox.notifications.length + ' notifications checked');
check('notification.videoId refs exist', badNotifVideo.length === 0,
  badNotifVideo.length ? 'bad: ' + badNotifVideo.map((n) => n.id).join(',') : 'checked');

/* 7. thread refs */
const badThreadUser = inbox.threads.filter((t) => !userIds.has(t.userId));
check('thread.userId exists in users', badThreadUser.length === 0,
  badThreadUser.length ? 'bad: ' + badThreadUser.map((t) => t.id).join(',') : inbox.threads.length + ' threads checked');
let badMsgThread = 0, msgTotal = 0;
inbox.threads.forEach((t) => {
  t.messages.forEach((m) => { msgTotal++; if (m.threadId !== t.id) badMsgThread++; });
});
check('message.threadId matches its thread', badMsgThread === 0, msgTotal + ' messages checked');

/* 8. graph refs */
const badFollow = graph.follows.filter(([a, b]) => !userIds.has(a) || !userIds.has(b));
const badLike = graph.likes.filter(([a, v]) => !userIds.has(a) || !videoIds.has(v));
const badBookmark = graph.bookmarks.filter(([a, v]) => !userIds.has(a) || !videoIds.has(v));
check('graph.follows refs exist', badFollow.length === 0, graph.follows.length + ' pairs checked');
check('graph.likes refs exist', badLike.length === 0, graph.likes.length + ' pairs checked');
check('graph.bookmarks refs exist', badBookmark.length === 0, graph.bookmarks.length + ' pairs checked');

/* 9. u01 graph shape sanity */
const u01Follows = graph.follows.filter(([a]) => a === 'u01').length;
const u01Likes = graph.likes.filter(([a]) => a === 'u01').length;
const u01Bookmarks = graph.bookmarks.filter(([a]) => a === 'u01').length;
check('u01 follows exactly 10 creators', u01Follows === 10, 'found ' + u01Follows);
check('u01 likes ~15 videos', u01Likes >= 13 && u01Likes <= 17, 'found ' + u01Likes);
check('u01 bookmarks 4 videos', u01Bookmarks === 4, 'found ' + u01Bookmarks);

const failed = results.filter((r) => !r.ok);
console.log(failed.length === 0 ? '\nALL CHECKS PASSED' : '\n' + failed.length + ' CHECK(S) FAILED');
process.exit(failed.length === 0 ? 0 : 1);
