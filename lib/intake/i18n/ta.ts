/**
 * Tamil (தமிழ்) landlord copy.
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
 *    reply something we do not recognise is stuck. (Tamil அழி / ரத்து / ஆம்
 *    are also accepted, so both are offered.)
 * 2. Keep every `{placeholder}` exactly as written. An unknown placeholder
 *    renders as empty, so a typo silently deletes information.
 */

import type { Catalogue } from './index';

export const ta: Catalogue = {
  receivedAck:
    'கிடைத்தது{name}! உங்கள் விளம்பரத்தைத் தயாரிக்கிறோம் — சில நிமிடங்களில் இங்கேயே தெரிவிப்போம்.',

  updateAck:
    'நன்றி — கிடைத்தது! உங்கள் விளம்பரத்தைப் புதுப்பிக்கிறோம், சில நிமிடங்கள் தாருங்கள்.',

  manualReview:
    'நன்றி{name}! எங்கள் குழு உங்கள் விளம்பரத்தைச் சரிபார்த்து இங்கேயே பதிலளிக்கும்.',

  needsInfo:
    'நன்றி{name}!{echo} வெளியிட இன்னும் தேவை: {fields}. விவரங்களை இங்கேயே அனுப்புங்கள்.',
  needsInfoNoFields: 'நன்றி{name}! இன்னும் சில விவரங்கள் தேவை — இங்கேயே அனுப்புங்கள்.',
  needsInfoEcho: ' கிடைத்தது — {summary}.',
  listJoin: 'மற்றும்',

  'field.title': 'சொத்து வகை (வீடு / அடுக்குமாடி / அறை)',
  'field.address': 'முகவரி',
  'field.city': 'நகரம்',
  'field.bedrooms': 'படுக்கையறைகளின் எண்ணிக்கை',
  'field.rentPerMonth': 'மாத வாடகை',

  'understood.bedrooms': 'படுக்கையறைகள் {n}',
  'understood.city': '{city}',
  'understood.rent': 'மாதம் ரூ. {rent}',

  'type.house': 'வீடு',
  'type.apartment': 'அடுக்குமாடி',
  'type.room': 'அறை',
  'type.annex': 'இணைப்பு',

  'published.live': '🎉 உங்கள் விளம்பரம் "{title}" இப்போது Easy Rent இல் நேரலையில்:',
  'published.edit': '✏️ நீங்களே மாற்றலாம் (கடவுச்சொல் தேவையில்லை):',
  'published.remove': '🗑️ நீக்க:',
  'published.photos': '📷 புகைப்படங்கள் சேர்க்க வேண்டுமா? 2 நாட்களுக்குள் இங்கே அனுப்புங்கள்.',
  'published.contact': 'வாடகைதாரர்கள் உங்களை நேரடியாகத் தொடர்புகொள்வார்கள்.',

  goLive: '🎉 உங்கள் விளம்பரம் "{title}" இப்போது நேரலையில்: {url}',

  pendingReview:
    'நன்றி! உங்கள் விளம்பரம் "{title}" உருவாக்கப்பட்டு எங்கள் குழுவின் விரைவான பரிசீலனையில் உள்ளது. நேரலைக்கு வந்ததும் தெரிவிப்போம்.',

  'pending.edit': '✏️ இதற்கிடையில் நீங்கள் விவரங்களை மாற்றலாம்:',
  'pending.remove': '🗑️ அல்லது நீக்க:',
  photosOverCap:
    '\n\n🖼️ ஒரு விளம்பரத்திற்கு {cap} புகைப்படங்கள் வரை காட்டுகிறோம், எனவே கடைசி {over} பயன்படுத்தப்படவில்லை. மாற்ற எப்போது வேண்டுமானாலும் இங்கே பதிலளியுங்கள்.',
  resendAsPhotos:
    'குறிப்பு: வீடியோ, கோப்பு அல்லது குரல் குறிப்பாக அனுப்பப்பட்ட இணைப்புகள் வரவில்லை — உங்கள் புகைப்படங்களை வழக்கமான WhatsApp படங்களாக மீண்டும் அனுப்புங்கள்.',
  manualReviewPending:
    'நன்றி — கிடைத்தது. எங்கள் குழு இதைப் பரிசீலித்து விரைவில் இங்கேயே பதிலளிக்கும்.',

  stuck:
    'நன்றி{name} — எங்களுக்குத் தேவையான அனைத்தையும் நீங்கள் அனுப்பிவிட்டீர்கள். மீண்டும் கேட்பதற்குப் பதிலாக, எங்கள் குழுவினர் ஒருவர் உங்கள் விளம்பரத்தைக் கையால் முடிப்பார், அது நேரலைக்கு வந்ததும் இங்கேயே தெரிவிப்பார்.',

  photosAdded: '📷 {added} புகைப்படங்கள் "{title}" இல் சேர்க்கப்பட்டன.',
  photosQueued:
    '📸 "{title}" க்கு {added} புகைப்படங்கள் கிடைத்தன — சரிபார்த்த பின் சில நிமிடங்களில் தோன்றும்.',
  'photos.someFailed': ' {failed} புகைப்படங்கள் வரவில்லை — மீண்டும் அனுப்புங்கள்.',
  'photos.overCapInline': ' மேலும் {over} புகைப்படங்கள் இடம்பெறவில்லை — இந்த விளம்பரம் புகைப்பட வரம்பை எட்டிவிட்டது.',
  'photos.wrongListing':
    '\nஅவை வேறு விளம்பரத்திற்கானவை என்றால், இங்கே பதிலளியுங்கள், எங்கள் குழு சரிசெய்யும்.',
  photosMissed: '⚠️ {failed} புகைப்படங்கள் வரவில்லை — மீண்டும் அனுப்புங்கள்.',

  help: [
    'நீங்கள் செய்யக்கூடியவை:',
    '',
    '🏠 விவரங்கள் (முகவரி, நகரம், படுக்கையறைகள், மாத வாடகை) மற்றும் புகைப்படங்கள் அனுப்புங்கள் — நாங்கள் விளம்பரத்தை உருவாக்குவோம்.',
    '✏️ LINK என அனுப்புங்கள் — பார்க்க, மாற்ற அல்லது நீக்க இணைப்புகளை அனுப்புவோம்.',
    '🗑️ DELETE என அனுப்புங்கள் — விளம்பரத்தை நீக்க உதவுவோம்.',
  ].join('\n'),

  'delete.which': 'எந்த விளம்பரத்தை நீக்க வேண்டும்?',
  'delete.replyNumber': 'எண்ணை அனுப்புங்கள், நிறுத்த CANCEL என அனுப்புங்கள்.',
  'delete.confirm':
    'நீங்கள் "{title}" ஐ Easy Rent இலிருந்து நீக்கப் போகிறீர்கள்.\n\nஉறுதிப்படுத்த DELETE என பதிலளியுங்கள், வேறு எதை அனுப்பினாலும் ரத்தாகும்.',
  'delete.done':
    '🗑️ "{title}" நீக்கப்பட்டது. இது இனி வாடகைதாரர்களுக்குத் தெரியாது.\n\nமனம் மாறியதா? 30 நாட்களுக்குள் RESTORE என அனுப்புங்கள், நாங்கள் மீண்டும் சேர்ப்போம்.',
  'delete.cancelled': 'எந்த மாற்றமும் இல்லை. விளம்பரத்தை நீக்க மீண்டும் DELETE என அனுப்புங்கள்.',

  saleAd:
    'நன்றி{name}! இது விற்பனைக்கான சொத்து போல் தெரிகிறது. Easy Rent வாடகைக்கு மட்டுமே — விற்பனைச் சொத்துகளை நாங்கள் வெளியிடுவதில்லை.\n\nநீங்கள் இதை வாடகைக்கு விட விரும்பினால், மாத வாடகையை அனுப்புங்கள், நாங்கள் விளம்பரத்தை உருவாக்குவோம்.',

  socialConsent: [
    '📣 "{title}" ஐ இன்னும் பலருக்குக் காட்டவா?',
    '',
    'Easy Rent இன் Facebook, Instagram மற்றும் TikTok கணக்குகளில் பகிரலாம் — உங்கள் புகைப்படங்கள், வாடகை மற்றும் விளம்பரத்திற்கான இணைப்புடன்.',
    '',
    'உங்கள் தொலைபேசி எண் ஒருபோதும் சேர்க்கப்படாது.',
    '',
    'பகிர YES (அல்லது ஆம்) என அனுப்புங்கள், வேண்டாம் எனில் NO என அனுப்புங்கள்.',
  ].join('\n'),
};
