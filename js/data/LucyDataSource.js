/* Project Lucy — abstract data-source contract.
 * Every method throws `not implemented`. Concrete sources (e.g. the IndexedDB
 * implementation) override the full surface. All methods are promise-based. */

export default class LucyDataSource {
  seedIfNeeded(){ throw new Error('not implemented'); }
  getFeed(/* tab: 'foryou' | 'following' */){ throw new Error('not implemented'); }
  getVideo(/* id */){ throw new Error('not implemented'); }
  getUser(/* idOrHandle */){ throw new Error('not implemented'); }
  getVideosByUser(/* userId */){ throw new Error('not implemented'); }
  getLikedVideos(){ throw new Error('not implemented'); }
  getBookmarkedVideos(){ throw new Error('not implemented'); }
  toggleLike(/* videoId */){ throw new Error('not implemented'); }
  toggleBookmark(/* videoId */){ throw new Error('not implemented'); }
  toggleFollow(/* userId */){ throw new Error('not implemented'); }
  isFollowing(/* userId */){ throw new Error('not implemented'); }
  addComment(/* videoId, text, parentId */){ throw new Error('not implemented'); }
  likeComment(/* commentId */){ throw new Error('not implemented'); }
  getComments(/* videoId */){ throw new Error('not implemented'); }
  getCommentCount(/* videoId */){ throw new Error('not implemented'); }
  postVideo(/* {blob, caption, audioTitle, audioArtist, durationSec, posterBlob} */){ throw new Error('not implemented'); }
  updateProfile(/* patch */){ throw new Error('not implemented'); }
  getNotifications(){ throw new Error('not implemented'); }
  getUnreadNotificationCount(){ throw new Error('not implemented'); }
  markNotificationRead(/* id */){ throw new Error('not implemented'); }
  markAllNotificationsRead(){ throw new Error('not implemented'); }
  getThreads(){ throw new Error('not implemented'); }
  getMessages(/* threadId */){ throw new Error('not implemented'); }
  sendMessage(/* threadId, text */){ throw new Error('not implemented'); }
  search(/* q */){ throw new Error('not implemented'); }
  getTrendingHashtags(/* limit */){ throw new Error('not implemented'); }
  getVideosByHashtag(/* tag */){ throw new Error('not implemented'); }
  getVideosByCategory(/* cat */){ throw new Error('not implemented'); }
  getCategories(){ throw new Error('not implemented'); }
  getAudioTracks(){ throw new Error('not implemented'); }
}
