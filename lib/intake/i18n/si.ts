/**
 * Sinhala (සිංහල) landlord copy.
 *
 * ⚠️ DRAFT — NOT NATIVE-REVIEWED. `enableLocalizedReplies` is OFF by default
 * precisely so this file reaches a native speaker before it reaches a landlord.
 * Reviewers: the English gloss for every key is in the builder that uses it in
 * `lib/intake/messages.ts`; the key names match one-to-one.
 *
 * TWO RULES WHEN EDITING:
 *
 * 1. Keep the CAPITALISED Latin keywords — DELETE, CANCEL, RESTORE, LINK, YES.
 *    `lib/intake/commands.ts` matches on them, and a landlord who is told to
 *    reply something we do not recognise is stuck. (Sinhala මකන්න / අවලංගු /
 *    ඔව් are also accepted, so both are offered.)
 * 2. Keep every `{placeholder}` exactly as written. An unknown placeholder
 *    renders as empty, so a typo silently deletes information.
 */

import type { Catalogue } from './index';

export const si: Catalogue = {
  receivedAck:
    'ලැබුණා{name}! ඔබේ දැන්වීම සකස් කරමින් සිටිමු — විනාඩි කිහිපයකින් මෙතැනින්ම දැනුම් දෙන්නෙමු.',

  updateAck: 'ස්තූතියි — ලැබුණා! ඔබේ දැන්වීම යාවත්කාලීන කරමින් සිටිමු, විනාඩි කිහිපයක් දෙන්න.',

  manualReview:
    'ස්තූතියි{name}! අපගේ කණ්ඩායම ඔබේ දැන්වීම කෙටියෙන් පරීක්ෂා කර මෙතැනින්ම පිළිතුරු දෙනු ඇත.',

  // The message this whole change exists for: name the missing field in the
  // landlord's own language, not just the sentence around it.
  needsInfo:
    'ස්තූතියි{name}!{echo} ප්‍රසිද්ධ කිරීමට තව අවශ්‍යයි: {fields}. විස්තර මෙතැනින්ම එවන්න.',
  needsInfoNoFields: 'ස්තූතියි{name}! තව තොරතුරු ස්වල්පයක් අවශ්‍යයි — මෙතැනින්ම එවන්න.',
  needsInfoEcho: ' ලැබුණා — {summary}.',
  listJoin: 'සහ',

  'field.title': 'දේපළ වර්ගය (නිවස / මහල් නිවාස / කාමරය)',
  'field.address': 'ලිපිනය',
  'field.city': 'නගරය',
  'field.bedrooms': 'නිදන කාමර ගණන',
  'field.rentPerMonth': 'මාසික කුලිය',

  'understood.bedrooms': 'නිදන කාමර {n}',
  'understood.city': '{city}',
  'understood.rent': 'මසකට රු. {rent}',

  'type.house': 'නිවසක්',
  'type.apartment': 'මහල් නිවාසයක්',
  'type.room': 'කාමරයක්',
  'type.annex': 'අනුබද්ධයක්',

  'published.live': '🎉 ඔබේ දැන්වීම "{title}" දැන් Easy Rent හි සජීවීයි:',
  'published.edit': '✏️ ඔබටම වෙනස් කළ හැක (මුරපදයක් අවශ්‍ය නැත):',
  'published.remove': '🗑️ ඉවත් කිරීමට:',
  'published.photos': '📷 ඡායාරූප එකතු කරන්නද? දින 2ක් ඇතුළත මෙතැනට එවන්න.',
  'published.contact': 'කුලී ගැනුම්කරුවන් ඔබට කෙලින්ම කතා කරයි.',

  goLive: '🎉 ඔබේ දැන්වීම "{title}" දැන් සජීවීයි: {url}',

  pendingReview:
    'ස්තූතියි! ඔබේ දැන්වීම "{title}" සාදා ඇති අතර කෙටි සමාලෝචනයක් සඳහා අපගේ කණ්ඩායම සතුව ඇත. සජීවී වූ විට දැනුම් දෙන්නෙමු.',

  'pending.edit': '✏️ මේ අතරතුර ඔබට විස්තර වෙනස් කළ හැක:',
  'pending.remove': '🗑️ නැතිනම් ඉවත් කිරීමට:',
  photosOverCap:
    '\n\n🖼️ එක් දැන්වීමකට ඡායාරූප {cap}ක් දක්වා පෙන්වන අතර, අවසන් {over} භාවිත නොවීය. මාරු කිරීමට ඕනෑම විටෙක මෙතැනින් පිළිතුරු දෙන්න.',
  resendAsPhotos:
    'සටහන: වීඩියෝ, ගොනු හෝ හඬ පණිවිඩ ලෙස එවූ ඇමුණුම් ලැබෙන්නේ නැත — කරුණාකර ඔබේ ඡායාරූප සාමාන්‍ය WhatsApp පින්තූර ලෙස නැවත එවන්න.',
  manualReviewPending:
    'ස්තූතියි — ලැබුණා. අපගේ කණ්ඩායම මෙය සමාලෝචනය කරමින් සිටින අතර ඉක්මනින් මෙතැනින්ම පිළිතුරු දෙනු ඇත.',

  photosAdded: '📷 ඡායාරූප {added}ක් "{title}" ට එකතු කළා.',
  photosQueued:
    '📸 "{title}" සඳහා ඡායාරූප {added}ක් ලැබුණා — පරීක්ෂා කිරීමෙන් පසු විනාඩි කිහිපයකින් පෙනෙනු ඇත.',
  'photos.someFailed': ' ඡායාරූප {failed}ක් ලැබුණේ නැත — කරුණාකර නැවත එවන්න.',
  'photos.overCapInline': ' තවත් ඡායාරූප {over}ක් නොගැළපුණි — මෙම දැන්වීම ඡායාරූප සීමාවට පැමිණ ඇත.',
  'photos.wrongListing':
    '\nඒවා වෙනත් දැන්වීමකට නම්, මෙතැනින් පිළිතුරු දෙන්න, අපගේ කණ්ඩායම එය හදාගනු ඇත.',
  photosMissed: '⚠️ ඡායාරූප {failed}ක් ලැබුණේ නැත — කරුණාකර නැවත එවන්න.',

  help: [
    'ඔබට කළ හැකි දේ:',
    '',
    '🏠 විස්තර (ලිපිනය, නගරය, නිදන කාමර, මාසික කුලිය) සහ ඡායාරූප එවන්න — අපි දැන්වීම සාදන්නෙමු.',
    '✏️ LINK කියා එවන්න — බැලීමට, වෙනස් කිරීමට හෝ ඉවත් කිරීමට සබැඳි එවන්නෙමු.',
    '🗑️ DELETE කියා එවන්න — දැන්වීමක් ඉවත් කිරීමට උදව් කරන්නෙමු.',
  ].join('\n'),

  'delete.which': 'කුමන දැන්වීමද ඉවත් කරන්නේ?',
  // CANCEL kept in Latin caps: commands.ts matches it (අවලංගු also works).
  'delete.replyNumber': 'අංකය එවන්න, නැවැත්වීමට CANCEL කියා එවන්න.',
  'delete.confirm':
    'ඔබ "{title}" Easy Rent වෙතින් ඉවත් කිරීමට යයි.\n\nතහවුරු කිරීමට DELETE කියා පිළිතුරු දෙන්න, නැතිනම් වෙනත් ඕනෑම දෙයක් එවුවොත් අවලංගු වේ.',
  'delete.done':
    '🗑️ "{title}" ඉවත් කළා. එය තවදුරටත් කුලී ගැනුම්කරුවන්ට නොපෙනේ.\n\nඅදහස වෙනස් වුණාද? දින 30ක් ඇතුළත RESTORE කියා එවන්න, අපි නැවත එකතු කරන්නෙමු.',
  'delete.cancelled': 'වෙනසක් කළේ නැත. දැන්වීමක් ඉවත් කිරීමට නැවත DELETE කියා එවන්න.',

  // Sale ads: the landlord is not doing anything wrong, so the tone stays warm
  // and gives them the one thing that would make it publishable.
  saleAd:
    'ස්තූතියි{name}! මෙය විකිණීමට ඇති දේපළක් ලෙස පෙනේ. Easy Rent යනු කුලියට දීම සඳහා පමණක් වන අඩවියකි — විකිණීමට ඇති දේපළ අපි ප්‍රසිද්ධ නොකරමු.\n\nඔබ මෙය කුලියට දීමට කැමති නම්, මාසික කුලිය එවන්න, අපි දැන්වීම සාදන්නෙමු.',

  socialConsent: [
    '📣 "{title}" තව බොහෝ දෙනෙකුට පෙන්වන්නද?',
    '',
    'Easy Rent හි Facebook, Instagram සහ TikTok ගිණුම්වල එය බෙදාගත හැක — ඔබේ ඡායාරූප, කුලිය සහ දැන්වීමට සබැඳියක් සමඟ.',
    '',
    'ඔබේ දුරකථන අංකය කිසිවිටෙක ඇතුළත් නොවේ.',
    '',
    'බෙදාගැනීමට YES (හෝ ඔව්) කියා එවන්න, එපා නම් NO කියා එවන්න.',
  ].join('\n'),
};
