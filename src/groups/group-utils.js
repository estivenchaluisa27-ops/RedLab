const _membersCache = new Map();

export function clearGroupUtilsCache() {
  _membersCache.clear();
}

export async function lookupMembersByGroupName(db, courseId, groupName) {
  if (!courseId) return [];
  const cacheKey = `${courseId}_${groupName}`;
  if (_membersCache.has(cacheKey)) {
    return _membersCache.get(cacheKey);
  }
  try {
    const { collection, query, where, getDocs } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
    const q = query(collection(db, "courses", courseId, "groups"), where("name", "==", groupName));
    const gSnap = await getDocs(q);
    const members = gSnap.empty ? [] : gSnap.docs[0].data().members || [];
    _membersCache.set(cacheKey, members);
    return members;
  } catch (e) {
    console.error("Error fetching members", e);
    return [];
  }
}
