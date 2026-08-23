/**
 * Static Sri Lanka location gazetteer for the rule-based intake parser.
 * Canonical city names match what the listing form stores free-text today
 * (seed data in lib/db/seed-sample-data.ts uses the same spellings).
 * Pure data + matchers — no runtime dependencies.
 */

export const DISTRICTS = [
  'Colombo',
  'Gampaha',
  'Kalutara',
  'Kandy',
  'Matale',
  'Nuwara Eliya',
  'Galle',
  'Matara',
  'Hambantota',
  'Jaffna',
  'Kilinochchi',
  'Mannar',
  'Vavuniya',
  'Mullaitivu',
  'Batticaloa',
  'Ampara',
  'Trincomalee',
  'Kurunegala',
  'Puttalam',
  'Anuradhapura',
  'Polonnaruwa',
  'Badulla',
  'Monaragala',
  'Ratnapura',
  'Kegalle',
] as const;

export type District = (typeof DISTRICTS)[number];

export interface GazetteerCity {
  /** Canonical form, as stored on listings.city. */
  name: string;
  district: District;
  /** Lowercase alternates: short forms, misspellings, Sinhala script. */
  aliases?: string[];
}

export const CITIES: GazetteerCity[] = [
  // Colombo district
  { name: 'Colombo', district: 'Colombo', aliases: ['කොළඹ', 'கொழும்பு'] },
  { name: 'Nugegoda', district: 'Colombo', aliases: ['නුගේගොඩ', 'நுகேகொடை'] },
  { name: 'Mount Lavinia', district: 'Colombo', aliases: ['mt lavinia', 'mt. lavinia', 'galkissa', 'ගල්කිස්ස', 'கல்கிசை'] },
  { name: 'Dehiwala', district: 'Colombo', aliases: ['dehiwela', 'දෙහිවල', 'தெஹிவளை'] },
  { name: 'Moratuwa', district: 'Colombo', aliases: ['මොරටුව', 'மொரட்டுவ'] },
  { name: 'Ratmalana', district: 'Colombo', aliases: ['රත්මලාන', 'ரத்மலானை'] },
  { name: 'Battaramulla', district: 'Colombo', aliases: ['බත්තරමුල්ල', 'பத்தரமுல்லை'] },
  { name: 'Rajagiriya', district: 'Colombo', aliases: ['රාජගිරිය', 'ராஜகிரிய'] },
  { name: 'Nawala', district: 'Colombo', aliases: ['නාවල', 'நாவல'] },
  { name: 'Kottawa', district: 'Colombo', aliases: ['කොට්ටාව', 'கொட்டாவ'] },
  { name: 'Maharagama', district: 'Colombo', aliases: ['මහරගම', 'மகரகம'] },
  { name: 'Boralesgamuwa', district: 'Colombo', aliases: ['බොරලැස්ගමුව', 'பொரலஸ்கமுவ'] },
  { name: 'Kaduwela', district: 'Colombo', aliases: ['කඩුවෙල', 'கடுவெல'] },
  { name: 'Piliyandala', district: 'Colombo', aliases: ['පිළියන්දල', 'பிலியந்தல'] },
  { name: 'Kohuwala', district: 'Colombo', aliases: ['කොහුවල', 'கொஹுவல'] },
  { name: 'Pannipitiya', district: 'Colombo', aliases: ['පන්නිපිටිය', 'பன்னிபிட்டிய'] },
  { name: 'Homagama', district: 'Colombo', aliases: ['හෝමාගම', 'ஹோமாகம'] },
  { name: 'Malabe', district: 'Colombo', aliases: ['මාලබේ', 'மாலபே'] },
  { name: 'Athurugiriya', district: 'Colombo', aliases: ['අතුරුගිරිය', 'அத்துருகிரிய'] },
  { name: 'Kesbewa', district: 'Colombo', aliases: ['කැස්බෑව', 'கெஸ்பேவ'] },
  { name: 'Avissawella', district: 'Colombo', aliases: ['අවිස්සාවේල්ල', 'அவிசாவளை'] },
  { name: 'Kolonnawa', district: 'Colombo', aliases: ['කොලොන්නාව', 'கொலன்னாவ'] },
  { name: 'Wellampitiya', district: 'Colombo', aliases: ['වැල්ලම්පිටිය', 'வெல்லம்பிட்டிய'] },
  { name: 'Angoda', district: 'Colombo', aliases: ['අංගොඩ', 'அங்கொட'] },
  { name: 'Mulleriyawa', district: 'Colombo', aliases: ['මුල්ලේරියාව', 'முல்லேரியாவ'] },
  { name: 'Kotikawatta', district: 'Colombo', aliases: ['කොටිකාවත්ත', 'கொட்டிகாவத்தை'] },
  { name: 'Hokandara', district: 'Colombo', aliases: ['හෝකන්දර', 'ஹொகந்தர'] },
  { name: 'Thalawathugoda', district: 'Colombo', aliases: ['talawatugoda', 'තලවතුගොඩ', 'தலவத்துகொடை'] },
  { name: 'Katubedda', district: 'Colombo', aliases: ['කටුබැද්ද', 'கட்டுபெத்த'] },
  { name: 'Hanwella', district: 'Colombo', aliases: ['හංවැල්ල', 'ஹன்வெல்ல'] },
  { name: 'Padukka', district: 'Colombo', aliases: ['පාදුක්ක', 'பாதுக்க'] },
  { name: 'Sri Jayawardenepura Kotte', district: 'Colombo', aliases: ['kotte', 'ශ්‍රී ජයවර්ධනපුර කෝට්ටේ', 'කෝට්ටේ', 'கோட்டே'] },
  { name: 'Colombo 2', district: 'Colombo', aliases: ['slave island', 'කොම්පඤ්ඤවීදිය', 'கொம்பனித்தெரு'] },
  { name: 'Colombo 3', district: 'Colombo', aliases: ['kollupitiya', 'colpetty', 'කොල්ලුපිටිය', 'கொள்ளுப்பிட்டி'] },
  { name: 'Colombo 4', district: 'Colombo', aliases: ['bambalapitiya', 'බම්බලපිටිය', 'பம்பலப்பிட்டி'] },
  { name: 'Colombo 5', district: 'Colombo', aliases: ['narahenpita', 'havelock town', 'නාරාහේන්පිට', 'நாரஹேன்பிட்டி'] },
  { name: 'Colombo 6', district: 'Colombo', aliases: ['wellawatte', 'wellawatta', 'වැල්ලවත්ත', 'வெள்ளவத்தை'] },
  { name: 'Colombo 7', district: 'Colombo', aliases: ['cinnamon gardens', 'කුරුඳුවත්ත', 'கறுவாத்தோட்டம்'] },
  { name: 'Colombo 8', district: 'Colombo', aliases: ['borella', 'බොරැල්ල', 'பொரளை'] },
  { name: 'Colombo 9', district: 'Colombo', aliases: ['dematagoda', 'දෙමටගොඩ', 'தெமட்டகொடை'] },
  { name: 'Colombo 10', district: 'Colombo', aliases: ['maradana', 'මරදාන', 'மருதானை'] },
  { name: 'Colombo 11', district: 'Colombo', aliases: ['pettah', 'පිටකොටුව', 'பெட்டை'] },
  { name: 'Colombo 13', district: 'Colombo', aliases: ['kotahena', 'කොටහේන', 'கொட்டாஞ்சேனை'] },
  { name: 'Colombo 14', district: 'Colombo', aliases: ['grandpass', 'ග්‍රෑන්ඩ්පාස්', 'கிராண்ட்பாஸ்'] },
  { name: 'Colombo 15', district: 'Colombo', aliases: ['mattakkuliya', 'mutwal', 'මට්ටක්කුලිය', 'මෝදර', 'மாத்தளை வீதி'] },
  // Gampaha district
  { name: 'Gampaha', district: 'Gampaha', aliases: ['ගම්පහ', 'கம்பஹா'] },
  { name: 'Negombo', district: 'Gampaha', aliases: ['negambo', 'මීගමුව', 'நீர்கொழும்பு'] },
  { name: 'Wattala', district: 'Gampaha', aliases: ['වත්තල', 'வத்தளை'] },
  { name: 'Kelaniya', district: 'Gampaha', aliases: ['කැලණිය', 'களனி'] },
  { name: 'Kiribathgoda', district: 'Gampaha', aliases: ['කිරිබත්ගොඩ', 'கிரிபத்கொடை'] },
  { name: 'Kadawatha', district: 'Gampaha', aliases: ['කඩවත', 'கடவத்தை'] },
  { name: 'Ja-Ela', district: 'Gampaha', aliases: ['ja ela', 'jaela', 'ජා-ඇල', 'ජාඇල', 'ஜா-எல'] },
  { name: 'Kandana', district: 'Gampaha', aliases: ['කන්දාන', 'கந்தானை'] },
  { name: 'Ragama', district: 'Gampaha', aliases: ['රාගම', 'ராகம'] },
  { name: 'Minuwangoda', district: 'Gampaha', aliases: ['මිනුවන්ගොඩ', 'மினுவங்கொடை'] },
  { name: 'Seeduwa', district: 'Gampaha', aliases: ['සීදුව', 'சீதுவை'] },
  { name: 'Katunayake', district: 'Gampaha', aliases: ['කටුනායක', 'கட்டுநாயக்க'] },
  { name: 'Nittambuwa', district: 'Gampaha', aliases: ['නිත්තඹුව', 'நித்தம்புவ'] },
  { name: 'Veyangoda', district: 'Gampaha', aliases: ['වේයන්ගොඩ', 'வேயங்கொடை'] },
  { name: 'Mirigama', district: 'Gampaha', aliases: ['මීරිගම', 'மீரிகம'] },
  { name: 'Divulapitiya', district: 'Gampaha', aliases: ['දිවුලපිටිය', 'திவுலபிட்டிய'] },
  { name: 'Yakkala', district: 'Gampaha', aliases: ['යක්කල', 'யக்கல'] },
  { name: 'Ganemulla', district: 'Gampaha', aliases: ['ගණේමුල්ල', 'கணேமுல்ல'] },
  { name: 'Delgoda', district: 'Gampaha', aliases: ['දෙල්ගොඩ', 'தெல்கொடை'] },
  { name: 'Biyagama', district: 'Gampaha', aliases: ['බියගම', 'பியகம'] },
  // Kalutara district
  { name: 'Kalutara', district: 'Kalutara', aliases: ['කළුතර', 'களுத்துறை'] },
  { name: 'Panadura', district: 'Kalutara', aliases: ['පානදුර', 'பாணந்துறை'] },
  { name: 'Horana', district: 'Kalutara', aliases: ['හොරණ', 'ஹொரண'] },
  { name: 'Wadduwa', district: 'Kalutara', aliases: ['වාද්දුව', 'வாத்துவ'] },
  { name: 'Beruwala', district: 'Kalutara', aliases: ['බේරුවල', 'பேருவளை'] },
  { name: 'Aluthgama', district: 'Kalutara', aliases: ['අලුත්ගම', 'அளுத்கம'] },
  { name: 'Matugama', district: 'Kalutara', aliases: ['මතුගම', 'மத்துகம'] },
  { name: 'Bandaragama', district: 'Kalutara', aliases: ['බණ්ඩාරගම', 'பண்டாரகம'] },
  { name: 'Ingiriya', district: 'Kalutara', aliases: ['ඉංගිරිය', 'இங்கிரிய'] },
  // Kandy district
  { name: 'Kandy', district: 'Kandy', aliases: ['මහනුවර', 'கண்டி'] },
  { name: 'Peradeniya', district: 'Kandy', aliases: ['පේරාදෙණිය', 'பேராதனை'] },
  { name: 'Katugastota', district: 'Kandy', aliases: ['කටුගස්තොට', 'கட்டுகஸ்தோட்டை'] },
  { name: 'Gampola', district: 'Kandy', aliases: ['ගම්පොල', 'கம்பளை'] },
  { name: 'Kundasale', district: 'Kandy', aliases: ['කුණ්ඩසාලේ', 'குண்டசாலை'] },
  { name: 'Pilimathalawa', district: 'Kandy', aliases: ['pilimatalawa', 'පිලිමතලාව', 'பிலிமத்தலாவ'] },
  { name: 'Akurana', district: 'Kandy', aliases: ['අකුරණ', 'அக்குறணை'] },
  { name: 'Digana', district: 'Kandy', aliases: ['දිගන', 'திகன'] },
  { name: 'Kadugannawa', district: 'Kandy', aliases: ['කඩුගන්නාව', 'கடுகண்ணாவ'] },
  { name: 'Nawalapitiya', district: 'Kandy', aliases: ['නාවලපිටිය', 'நாவலப்பிட்டி'] },
  // Matale district
  { name: 'Matale', district: 'Matale', aliases: ['මාතලේ', 'மாத்தளை'] },
  { name: 'Dambulla', district: 'Matale', aliases: ['දඹුල්ල', 'தம்புள்ளை'] },
  { name: 'Galewela', district: 'Matale', aliases: ['ගලේවෙල', 'கலேவெல'] },
  { name: 'Sigiriya', district: 'Matale', aliases: ['සීගිරිය', 'சிகிரியா'] },
  // Nuwara Eliya district
  { name: 'Nuwara Eliya', district: 'Nuwara Eliya', aliases: ['நுவரெலியா', 'නුවරඑළිය'] },
  { name: 'Hatton', district: 'Nuwara Eliya', aliases: ['ஹட்டன்', 'හැටන්'] },
  { name: 'Talawakele', district: 'Nuwara Eliya', aliases: ['talawakelle', 'தலவாக்கலை', 'තලවාකැලේ'] },
  // Galle district
  { name: 'Galle', district: 'Galle', aliases: ['ගාල්ල', 'காலி'] },
  { name: 'Hikkaduwa', district: 'Galle', aliases: ['හික්කඩුව', 'ஹிக்கடுவ'] },
  { name: 'Ambalangoda', district: 'Galle', aliases: ['අම්බලන්ගොඩ', 'அம்பலாங்கொடை'] },
  { name: 'Bentota', district: 'Galle', aliases: ['බෙන්තොට', 'பெந்தோட்டை'] },
  { name: 'Unawatuna', district: 'Galle', aliases: ['උණවටුන', 'உணவட்டுன'] },
  { name: 'Elpitiya', district: 'Galle', aliases: ['ඇල්පිටිය', 'எல்பிட்டிய'] },
  { name: 'Karapitiya', district: 'Galle', aliases: ['කරාපිටිය', 'கரபிட்டிய'] },
  { name: 'Ahangama', district: 'Galle', aliases: ['අහංගම', 'அஹங்கம'] },
  { name: 'Baddegama', district: 'Galle', aliases: ['බද්දේගම', 'பத்தேகம'] },
  // Matara district
  { name: 'Matara', district: 'Matara', aliases: ['මාතර', 'மாத்தறை'] },
  { name: 'Weligama', district: 'Matara', aliases: ['වැලිගම', 'வெலிகம'] },
  { name: 'Akuressa', district: 'Matara', aliases: ['අකුරැස්ස', 'அக்குரெஸ்ஸ'] },
  { name: 'Dickwella', district: 'Matara', aliases: ['dikwella', 'දික්වැල්ල', 'திக்வெல்ல'] },
  { name: 'Mirissa', district: 'Matara', aliases: ['මිරිස්ස', 'மிரிஸ்ஸ'] },
  // Hambantota district
  { name: 'Hambantota', district: 'Hambantota', aliases: ['හම්බන්තොට', 'அம்பாந்தோட்டை'] },
  { name: 'Tangalle', district: 'Hambantota', aliases: ['තංගල්ල', 'தங்காலை'] },
  { name: 'Ambalantota', district: 'Hambantota', aliases: ['අම්බලන්තොට', 'அம்பலாந்தோட்டை'] },
  { name: 'Tissamaharama', district: 'Hambantota', aliases: ['thissamaharama', 'තිස්සමහාරාමය', 'திஸ்ஸமகாராமை'] },
  { name: 'Beliatta', district: 'Hambantota', aliases: ['බෙලිඅත්ත', 'பெலியத்த'] },
  // North & East — Tamil-script aliases matter here: these are Tamil-majority
  // areas and a fully Tamil listing has no other way to resolve its city.
  { name: 'Jaffna', district: 'Jaffna', aliases: ['යාපනය', 'யாழ்ப்பாணம்', 'யாழ்'] },
  { name: 'Kilinochchi', district: 'Kilinochchi', aliases: ['கிளிநொச்சி', 'කිලිනොච්චිය'] },
  { name: 'Mannar', district: 'Mannar', aliases: ['மன்னார்', 'මන්නාරම'] },
  { name: 'Vavuniya', district: 'Vavuniya', aliases: ['வவுனியா', 'වවුනියාව'] },
  { name: 'Mullaitivu', district: 'Mullaitivu', aliases: ['mullativu', 'முல்லைத்தீவு', 'මුලතිව්'] },
  { name: 'Batticaloa', district: 'Batticaloa', aliases: ['மட்டக்களப்பு', 'මඩකලපුව'] },
  { name: 'Kalmunai', district: 'Ampara', aliases: ['கல்முனை', 'කල්මුනේ'] },
  { name: 'Ampara', district: 'Ampara', aliases: ['அம்பாறை', 'අම්පාර'] },
  { name: 'Trincomalee', district: 'Trincomalee', aliases: ['trinco', 'திருகோணமலை', 'ත්‍රිකුණාමලය'] },
  { name: 'Chavakachcheri', district: 'Jaffna', aliases: ['சாவகச்சேரி', 'චාවකච්චේරි'] },
  { name: 'Point Pedro', district: 'Jaffna', aliases: ['பருத்தித்துறை', 'பருத்திதுறை', 'පේදුරුතුඩුව'] },
  { name: 'Nallur', district: 'Jaffna', aliases: ['நல்லூர்', 'නල්ලූර්'] },
  { name: 'Chunnakam', district: 'Jaffna', aliases: ['சுன்னாகம்', 'චුන්නාකම්'] },
  { name: 'Manipay', district: 'Jaffna', aliases: ['மானிப்பாய்', 'මානිප්පායි'] },
  { name: 'Kattankudy', district: 'Batticaloa', aliases: ['காத்தான்குடி', 'කාත්තන්කුඩි'] },
  { name: 'Eravur', district: 'Batticaloa', aliases: ['ஏறாவூர்', 'ඒරාවූර්'] },
  { name: 'Valaichchenai', district: 'Batticaloa', aliases: ['valaichenai', 'வாழைச்சேனை', 'වාලච්චේන'] },
  { name: 'Akkaraipattu', district: 'Ampara', aliases: ['அக்கரைப்பற்று', 'අක්කරෙයිපත්තු'] },
  { name: 'Sammanthurai', district: 'Ampara', aliases: ['சம்மாந்துறை', 'සම්මන්තුරේ'] },
  { name: 'Pottuvil', district: 'Ampara', aliases: ['பொத்துவில்', 'පොතුවිල්'] },
  { name: 'Nintavur', district: 'Ampara', aliases: ['நிந்தவூர்', 'නින්තවූර්'] },
  { name: 'Kinniya', district: 'Trincomalee', aliases: ['கிண்ணியா', 'කිණ්ණියා'] },
  { name: 'Mutur', district: 'Trincomalee', aliases: ['muthur', 'மூதூர்', 'මූතූර්'] },
  { name: 'Nilaveli', district: 'Trincomalee', aliases: ['நிலாவெளி', 'නිලාවැලි'] },
  { name: 'Kantale', district: 'Trincomalee', aliases: ['kanthale', 'கந்தளாய்', 'කන්තලේ'] },
  // North-western / North-central
  { name: 'Kurunegala', district: 'Kurunegala', aliases: ['කුරුණෑගල', 'குருணாகல்'] },
  { name: 'Kuliyapitiya', district: 'Kurunegala', aliases: ['කුලියාපිටිය', 'குலியாபிட்டிய'] },
  { name: 'Narammala', district: 'Kurunegala', aliases: ['නාරම්මල', 'நாரம்மல'] },
  { name: 'Wariyapola', district: 'Kurunegala', aliases: ['වාරියපොල', 'வாரியபொல'] },
  { name: 'Pannala', district: 'Kurunegala', aliases: ['පන්නල', 'பன்னல'] },
  { name: 'Polgahawela', district: 'Kurunegala', aliases: ['පොල්ගහවෙල', 'பொல்கஹவெல'] },
  { name: 'Alawwa', district: 'Kurunegala', aliases: ['අලව්ව', 'அலவ்வ'] },
  { name: 'Puttalam', district: 'Puttalam', aliases: ['පුත්තලම', 'புத்தளம்'] },
  { name: 'Chilaw', district: 'Puttalam', aliases: ['හලාවත', 'சிலாபம்'] },
  { name: 'Wennappuwa', district: 'Puttalam', aliases: ['වෙන්නප්පුව', 'வென்னப்புவ'] },
  { name: 'Marawila', district: 'Puttalam', aliases: ['මාරවිල', 'மாரவில'] },
  { name: 'Nattandiya', district: 'Puttalam', aliases: ['නාත්තණ්ඩිය', 'நாட்டாண்டிய'] },
  { name: 'Dankotuwa', district: 'Puttalam', aliases: ['දංකොටුව', 'தான்கொட்டுவ'] },
  { name: 'Kalpitiya', district: 'Puttalam', aliases: ['කල්පිටිය', 'கல்பிட்டி'] },
  { name: 'Anuradhapura', district: 'Anuradhapura', aliases: ['අනුරාධපුරය', 'அனுராதபுரம்'] },
  { name: 'Kekirawa', district: 'Anuradhapura', aliases: ['කැකිරාව', 'கெக்கிராவ'] },
  { name: 'Polonnaruwa', district: 'Polonnaruwa', aliases: ['පොළොන්නරුව', 'பொலன்னறுவை'] },
  { name: 'Kaduruwela', district: 'Polonnaruwa', aliases: ['කඩුරුවෙල', 'கடுருவெல'] },
  { name: 'Hingurakgoda', district: 'Polonnaruwa', aliases: ['හිඟුරක්ගොඩ', 'ஹிங்குரக்கொடை'] },
  // Uva / Sabaragamuwa
  { name: 'Badulla', district: 'Badulla', aliases: ['பதுளை', 'බදුල්ල'] },
  { name: 'Bandarawela', district: 'Badulla', aliases: ['බණ්ඩාරවෙල', 'பண்டாரவளை'] },
  { name: 'Ella', district: 'Badulla', aliases: ['ඇල්ල', 'எல்ல'] },
  { name: 'Welimada', district: 'Badulla', aliases: ['වැලිමඩ', 'வெலிமடை'] },
  { name: 'Haputale', district: 'Badulla', aliases: ['හපුතලේ', 'ஹபுத்தளை'] },
  { name: 'Mahiyanganaya', district: 'Badulla', aliases: ['mahiyangana', 'මහියංගනය', 'மகியங்கனை'] },
  { name: 'Monaragala', district: 'Monaragala', aliases: ['මොනරාගල', 'மொனராகலை'] },
  { name: 'Wellawaya', district: 'Monaragala', aliases: ['වැල්ලවාය', 'வெல்லவாய'] },
  { name: 'Kataragama', district: 'Monaragala', aliases: ['කතරගම', 'கதிர்காமம்'] },
  { name: 'Buttala', district: 'Monaragala', aliases: ['බුත්තල', 'புத்தல'] },
  { name: 'Ratnapura', district: 'Ratnapura', aliases: ['රත්නපුර', 'இரத்தினபுரி'] },
  { name: 'Embilipitiya', district: 'Ratnapura', aliases: ['ඇඹිලිපිටිය', 'எம்பிலிபிட்டிய'] },
  { name: 'Balangoda', district: 'Ratnapura', aliases: ['බලංගොඩ', 'பலாங்கொடை'] },
  { name: 'Pelmadulla', district: 'Ratnapura', aliases: ['පැල්මඩුල්ල', 'பெல்மடுல்ல'] },
  { name: 'Eheliyagoda', district: 'Ratnapura', aliases: ['ඇහැලියගොඩ', 'எஹெலியகொடை'] },
  { name: 'Kegalle', district: 'Kegalle', aliases: ['කෑගල්ල', 'கேகாலை'] },
  { name: 'Mawanella', district: 'Kegalle', aliases: ['මාවනැල්ල', 'மாவனெல்ல'] },
  { name: 'Warakapola', district: 'Kegalle', aliases: ['වරකාපොල', 'வரகாபொல'] },
  { name: 'Rambukkana', district: 'Kegalle', aliases: ['රඹුක්කන', 'ரம்புக்கனை'] },
];

interface Candidate {
  key: string;
  city: string;
  district: District;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Flat lookup of names + aliases, longest key first so "Nuwara Eliya" wins
// over any shorter substring candidate.
const CANDIDATES: Candidate[] = CITIES.flatMap((c) => [
  { key: c.name.toLowerCase(), city: c.name, district: c.district },
  ...(c.aliases ?? []).map((a) => ({ key: a, city: c.name, district: c.district })),
]).sort((a, b) => b.key.length - a.key.length);

const CANDIDATE_RES = CANDIDATES.map((c) => ({
  ...c,
  // Unicode-safe word boundaries (JS \b is ASCII-only, breaks on Sinhala).
  re: new RegExp(`(?:^|[^\\p{L}\\d])${escapeRegExp(c.key)}(?=$|[^\\p{L}\\d])`, 'gu'),
}));

/**
 * Sri Lankan roads are routinely named after the town they lead to ("Negombo
 * Road" in Ja-Ela, "Kurunegala Road" in Kandy). A city mention immediately
 * followed by a street word is the road's name, not the listing's city.
 */
const ROAD_NAME_AFTER_RE =
  // NB: "junction" deliberately absent — "Borella Junction" names the locality.
  // Sinhala/Tamil words need the explicit lookahead: JS \b is ASCII-only and
  // never asserts after a non-Latin letter.
  /^\s*(?:(?:road|rd|street|st|mawatha|mw|lane|ln|para)\b|(?:පාර|මාවත|வீதி|தெரு|சாலை|ஒழுங்கை)(?=$|[^\p{L}\p{M}]))/iu;

function isRoadNameMention(lowerText: string, matchEnd: number): boolean {
  return ROAD_NAME_AFTER_RE.test(lowerText.slice(matchEnd, matchEnd + 12));
}

/** "colombo 5", "Colombo-07" → ward city. Wards run 1–15. */
const COLOMBO_WARD_RE = /(?:^|[^\p{L}\d])colombo\s*-?\s*0?(1[0-5]|[1-9])(?=$|[^\p{L}\d])/u;

/**
 * Finds the best city mention in lowercase text. Ward numbers beat the bare
 * "Colombo" match; otherwise longest gazetteer key wins.
 */
export function matchCity(lowerText: string): { city: string; district: District } | null {
  const ward = lowerText.match(COLOMBO_WARD_RE);
  if (ward) {
    return { city: `Colombo ${Number(ward[1])}`, district: 'Colombo' };
  }
  for (const c of CANDIDATE_RES) {
    c.re.lastIndex = 0;
    for (const m of lowerText.matchAll(c.re)) {
      const end = (m.index ?? 0) + m[0].length;
      if (isRoadNameMention(lowerText, end)) continue; // "Negombo Road" ≠ Negombo
      return { city: c.city, district: c.district };
    }
  }
  // Curated list exhausted — try the ~16k-strong DB catalogue.
  return extendedScan(lowerText);
}

/**
 * True only when the WHOLE string is a known city name/alias (or ward form) —
 * unlike matchCity, which searches. "kandana estate" is NOT a city name even
 * though it contains one.
 */
export function isCityName(lowerText: string): { city: string; district: District } | null {
  const t = lowerText.trim();
  const ward = t.match(COLOMBO_WARD_RE);
  if (ward && ward[0].trim() === t) {
    return { city: `Colombo ${Number(ward[1])}`, district: 'Colombo' };
  }
  for (const c of CANDIDATES) {
    if (c.key === t) return { city: c.city, district: c.district };
  }
  return extendedExact(t);
}

/**
 * All distinct cities mentioned (road names excluded). Used only to detect
 * multi-property messages — matchCity stays the authority on THE city.
 */
export function matchAllCities(lowerText: string): string[] {
  const found = new Set<string>();
  const ward = lowerText.match(COLOMBO_WARD_RE);
  if (ward) found.add(`Colombo ${Number(ward[1])}`);
  for (const c of CANDIDATE_RES) {
    if (found.has(c.city)) continue;
    if (ward && c.city === 'Colombo') continue; // "Colombo 5" already counted
    c.re.lastIndex = 0;
    for (const m of lowerText.matchAll(c.re)) {
      const end = (m.index ?? 0) + m[0].length;
      if (isRoadNameMention(lowerText, end)) continue;
      found.add(c.city);
      break;
    }
  }
  return [...found];
}

/**
 * Explicit district mention ("gampaha district" or a standalone district
 * name). Used only when no city matched — a city match already implies its
 * district.
 */
export function matchDistrict(lowerText: string): District | null {
  for (const d of DISTRICTS) {
    const key = escapeRegExp(d.toLowerCase());
    if (new RegExp(`(?:^|[^\\p{L}\\d])${key}(?:\\s+district)?(?=$|[^\\p{L}\\d])`, 'u').test(lowerText)) {
      return d;
    }
  }
  return null;
}

/**
 * Every canonical town name, sorted — the option list for pickers and filters.
 * Built from CITIES so the UI can never drift from what the matcher accepts,
 * which is exactly how the old hardcoded 12-city filter dropdown ended up
 * unable to find `Pannipitiya`, `Kolonnawa` or `Dehiwala`.
 */
export const CITY_NAMES: string[] = Array.from(new Set(CITIES.map((c) => c.name))).sort((a, b) =>
  a.localeCompare(b)
);

export interface NormalizedLocation {
  city: string;
  district: string | null;
  /** The town resolved to a gazetteer entry, rather than being kept as typed. */
  known: boolean;
  /** Set when a misspelling was corrected, carrying what the sender wrote. */
  corrected?: { from: string };
}

/** Title-case a free-typed place name without mangling "Ja-Ela" or "Ratnapura". */
function titleCasePlace(value: string): string {
  return value
    .toLowerCase()
    .replace(/(^|[\s\-'/])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

/**
 * Canonicalise a city/district pair as typed into a form field.
 *
 * Known town → the gazetteer's exact spelling, with its district derived (a
 * town implies its district, so a hand-typed one is never trusted over it).
 *
 * Unknown town → kept, tidied, NOT rejected. Sri Lanka has thousands of small
 * towns and `lib/moderation/location.ts` carries an explicit rule that an
 * unfamiliar one is a soft note and never a hold; refusing it here would
 * silently contradict that and cost real listings. The district is still
 * resolved on its own so the listing lands in the right 25-way bucket, which is
 * the axis search and grouping can actually rely on.
 */
export function normalizeLocation(
  cityInput: string | null | undefined,
  districtInput?: string | null
): NormalizedLocation {
  const rawCity = (cityInput ?? '').trim().replace(/\s+/g, ' ');
  const rawDistrict = (districtInput ?? '').trim().replace(/\s+/g, ' ');
  if (!rawCity) {
    const only = rawDistrict ? matchDistrict(rawDistrict.toLowerCase()) : null;
    return { city: '', district: only ?? (rawDistrict ? titleCasePlace(rawDistrict) : null), known: false };
  }

  const lower = rawCity.toLowerCase();
  // isCityName is the exact-match pass (the field holds ONE place name);
  // matchCity then catches the Colombo ward form, e.g. "colombo 07" → "Colombo 7".
  const hit = isCityName(lower) ?? matchCity(lower);
  if (hit) return { city: hit.city, district: hit.district, known: true };

  // Exact matching failed, so try for a misspelling. Safe here and NOT in a
  // free-text scan: this argument is a location field, so it is already
  // believed to be a place name rather than an arbitrary word.
  const fuzzy = fuzzyCityName(rawCity);
  if (fuzzy) {
    return {
      city: fuzzy.city,
      district: fuzzy.district,
      known: true,
      corrected: { from: rawCity },
    };
  }

  const district = rawDistrict ? matchDistrict(rawDistrict.toLowerCase()) : null;
  return {
    city: titleCasePlace(rawCity),
    district: district ?? (rawDistrict ? titleCasePlace(rawDistrict) : null),
    known: false,
  };
}

/* -------------------------------------------------------------------------
 * Typo tolerance
 *
 * Landlords misspell their own town ("Pannupitiya" for "Pannipitiya"), and an
 * unmatched town costs a whole listing: the city goes null, the submission
 * lands in needs_info, and the sender is asked for something they already gave.
 *
 * The danger is the opposite failure. A wrong town is worse than no town,
 * because nothing downstream ever questions it — so every guard below exists to
 * make a false positive impossible rather than merely unlikely, and callers
 * scanning free text must CONFIRM a suggestion rather than apply it.
 * ---------------------------------------------------------------------- */

/** Below this a single edit is most of the word: "sandy"→"Kandy", "gall"→"Galle". */
const FUZZY_MIN_LENGTH = 6;
/** Typos cluster in the middle and end; a wrong start means a different word. */
const FUZZY_PREFIX_LENGTH = 3;
/** A silent correction has to be near-certain — anything less gets confirmed. */
const FUZZY_CONFIDENT_MIN_LENGTH = 8;

/**
 * Words that reach a matcher looking like place names but never are. Without
 * this, "parking" sits one edit from a town and every listing mentioning it
 * acquires a location.
 */
const FUZZY_STOP_WORDS = new Set([
  'bedroom', 'bedrooms', 'bathroom', 'bathrooms', 'washroom', 'washrooms',
  'kitchen', 'parking', 'garage', 'balcony', 'veranda', 'verandah',
  'furnished', 'unfurnished', 'attached', 'upstairs', 'downstairs',
  'spacious', 'modern', 'luxury', 'available', 'immediately', 'monthly',
  'deposit', 'advance', 'perches', 'perch', 'square', 'storey', 'stories',
  'annexe', 'apartment', 'apartments', 'property', 'house', 'houses',
  'contact', 'whatsapp', 'number', 'please', 'thanks', 'message',
  'electricity', 'internet', 'security', 'servant', 'quarters',
]);

/**
 * Damerau-Levenshtein distance, abandoning the comparison once it cannot come
 * in at or under `max`. The early exit matters: this runs against every
 * gazetteer key for every candidate token.
 */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2 = new Array<number>(b.length + 1);
  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  let prevPrev: number[] | null = null;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      // Transposition ("Pannipitiya" → "Pannpiitiya") is one slip, not two.
      if (
        prevPrev &&
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        value = Math.min(value, prevPrev[j - 2] + cost);
      }
      curr[j] = value;
      if (value < rowMin) rowMin = value;
    }
    // Every remaining path only grows, so this can never recover.
    if (rowMin > max) return max + 1;
    prevPrev = prev;
    prev = curr;
    curr = prevPrev === prev2 ? prev2 : new Array<number>(b.length + 1);
  }
  return prev[b.length];
}

export interface FuzzyCityMatch {
  city: string;
  district: District;
  distance: number;
  /** Safe to apply without asking. Everything else must be confirmed. */
  confident: boolean;
}

/**
 * Nearest gazetteer town to a string that is already believed to BE a place
 * name — a form field, or a token a caller has isolated from free text.
 *
 * Never call this on whole free text: it would happily match a word from the
 * middle of a sentence. Returns null when any guard fails, and — deliberately —
 * when two different towns tie, because a coin flip between Matara and Matale
 * files the listing in the wrong district half the time.
 */
export function fuzzyCityName(input: string): FuzzyCityMatch | null {
  const token = (input ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (token.length < FUZZY_MIN_LENGTH) return null;
  if (FUZZY_STOP_WORDS.has(token)) return null;

  const budget = token.length >= 10 ? 2 : 1;
  const prefix = token.slice(0, FUZZY_PREFIX_LENGTH);

  let best: { candidate: Candidate; distance: number } | null = null;
  let ambiguous = false;

  for (const candidate of CANDIDATES) {
    if (candidate.key.length < FUZZY_MIN_LENGTH) continue;
    if (!candidate.key.startsWith(prefix)) continue;
    const distance = editDistance(token, candidate.key, budget);
    if (distance > budget) continue;
    if (!best || distance < best.distance) {
      best = { candidate, distance };
      ambiguous = false;
    } else if (distance === best.distance && candidate.city !== best.candidate.city) {
      ambiguous = true;
    }
  }

  // A curated hit wins outright: those spellings are the ones the app already
  // stores, and several have no CSV equivalent at all.
  if (best && !ambiguous) {
    return {
      city: best.candidate.city,
      district: best.candidate.district,
      distance: best.distance,
      confident: best.distance <= 1 && token.length >= FUZZY_CONFIDENT_MIN_LENGTH,
    };
  }
  // Ambiguity among curated names is not resolved by looking at more names —
  // it means we genuinely cannot tell, and guessing is the one outcome worth
  // avoiding.
  if (ambiguous) return null;
  return extendedFuzzy(token);
}

/* -------------------------------------------------------------------------
 * Extended catalogue (lib/locations/store.ts pushes this in)
 *
 * The 173 curated entries above stay the built-in baseline: pure, always
 * present, and what the unit tests run against with no database. The `locations`
 * table adds ~16k more towns and villages on top, exactly as feature flags layer
 * DB overrides over code defaults.
 *
 * Deliberately NOT wired into CANDIDATE_RES. matchCity tests one regex per
 * candidate against the whole message, so 16k of them would be ~50x the work on
 * every intake. The extension is a Map keyed by name instead, probed with word
 * n-grams from the message — O(words), not O(catalogue).
 * ---------------------------------------------------------------------- */

export interface ExtendedLocation {
  name: string;
  district: string;
}

let extendedByName: Map<string, ExtendedLocation> | null = null;
/** Bucketed by first 3 chars so fuzzy matching never scans all 16k. */
let extendedByPrefix: Map<string, ExtendedLocation[]> | null = null;

export function setExtendedLocations(entries: ExtendedLocation[] | null): void {
  if (!entries?.length) {
    extendedByName = null;
    extendedByPrefix = null;
    return;
  }
  const byName = new Map<string, ExtendedLocation>();
  const byPrefix = new Map<string, ExtendedLocation[]>();
  for (const e of entries) {
    const key = e.name.trim().toLowerCase();
    if (!key || byName.has(key)) continue;
    byName.set(key, e);
    if (key.length >= FUZZY_MIN_LENGTH) {
      const p = key.slice(0, FUZZY_PREFIX_LENGTH);
      const bucket = byPrefix.get(p);
      if (bucket) bucket.push(e);
      else byPrefix.set(p, [e]);
    }
  }
  extendedByName = byName;
  extendedByPrefix = byPrefix;
}

export function extendedLocationCount(): number {
  return extendedByName?.size ?? 0;
}

/** Whole-string lookup in the extended catalogue. */
function extendedExact(lower: string): { city: string; district: District } | null {
  const hit = extendedByName?.get(lower.trim());
  return hit ? { city: hit.name, district: hit.district as District } : null;
}

/**
 * Longest word n-gram of the message that names a place. Runs only after the
 * curated regex pass has failed, so the road-name and ward rules above still
 * decide anything they can.
 */
function extendedScan(lowerText: string): { city: string; district: District } | null {
  if (!extendedByName) return null;
  const words = lowerText.split(/[^\p{L}\p{M}\d]+/u).filter(Boolean);
  // Longest first: "nuwara eliya" must beat "nuwara".
  for (const size of [3, 2, 1]) {
    for (let i = 0; i + size <= words.length; i++) {
      const phrase = words.slice(i, i + size).join(' ');
      if (phrase.length < 4) continue;
      const hit = extendedByName.get(phrase);
      if (!hit) continue;
      // Same rule the curated pass uses: "Negombo Road" is not Negombo.
      const after = lowerText.indexOf(phrase) + phrase.length;
      if (isRoadNameMention(lowerText, after)) continue;
      return { city: hit.name, district: hit.district as District };
    }
  }
  return null;
}

/** Nearest extended-catalogue name, under the same guards as fuzzyCityName. */
function extendedFuzzy(token: string): FuzzyCityMatch | null {
  if (!extendedByPrefix) return null;
  const bucket = extendedByPrefix.get(token.slice(0, FUZZY_PREFIX_LENGTH));
  if (!bucket) return null;
  const budget = token.length >= 10 ? 2 : 1;
  let best: { entry: ExtendedLocation; distance: number } | null = null;
  let ambiguous = false;
  for (const entry of bucket) {
    const key = entry.name.toLowerCase();
    const distance = editDistance(token, key, budget);
    if (distance > budget) continue;
    if (!best || distance < best.distance) {
      best = { entry, distance };
      ambiguous = false;
    } else if (distance === best.distance && entry.name !== best.entry.name) {
      ambiguous = true;
    }
  }
  if (!best || ambiguous) return null;
  return {
    city: best.entry.name,
    district: best.entry.district as District,
    distance: best.distance,
    confident: best.distance <= 1 && token.length >= FUZZY_CONFIDENT_MIN_LENGTH,
  };
}

/* -------------------------------------------------------------------------
 * Disambiguation
 *
 * fuzzyCityName answers "which town is this" and refuses when two are equally
 * close. Refusing is right when nobody can be asked, but on WhatsApp there IS
 * someone to ask — so this returns the shortlist instead and lets the sender
 * settle it.
 * ---------------------------------------------------------------------- */

/** Similarity as a share of the longer string: "gampaga"/"gampaha" = 6/7 ≈ 0.86. */
export function nameSimilarity(a: string, b: string): number {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (!x || !y) return 0;
  const longest = Math.max(x.length, y.length);
  // Budget capped at the whole string; below the floor the score is useless anyway.
  const distance = editDistance(x, y, longest);
  return 1 - distance / longest;
}

export interface CityCandidate {
  city: string;
  district: District;
  similarity: number;
  /** Edit distance, kept because it decides auto-apply where a ratio cannot. */
  distance: number;
  /** From the hand-tuned list — a real town rather than a hamlet. */
  curated: boolean;
}

/** Below this a "match" shares so little with the input it would only confuse. */
const CANDIDATE_MIN_SIMILARITY = 0.6;
/**
 * Shorter than fuzzyCityName's floor on purpose. That floor exists because a
 * single edit on a short word is too weak to act on SILENTLY; here the sender
 * confirms, so "Kandi" can safely be offered Kandy/Kanda/Kande to choose from.
 */
const CANDIDATE_MIN_LENGTH = 4;
/**
 * A shortlist has to fit in a chat message and stay decidable at a glance.
 * A raw 0.6 cut returns 171 candidates for "Pannupitiya" against the full
 * catalogue, which is not a question anyone can answer.
 */
const CANDIDATE_LIMIT = 3;
/**
 * Auto-apply needs a long word, a single edit, and daylight over the runner-up.
 *
 * Length carries most of the weight, and a ratio alone cannot express why:
 * "Pannupitiya" → Pannipitiya is one letter in eleven and unmistakable, while
 * "Gampaga" → Gampaha is one letter in seven and could as easily have been
 * Gampola. Both score highly; only the first is safe to apply unasked.
 */
const CANDIDATE_CONFIDENT_MIN_LENGTH = 8;
const CANDIDATE_CONFIDENT_MARGIN = 0.06;

/**
 * Towns the input might mean, best first.
 *
 * Deduplicated by NAME: 1,610 names occur in more than one district, so a raw
 * list offers "Gampaha" twice and asks the sender to choose between two
 * identical-looking options. The better-ranked district wins (curated first,
 * then population — see lib/locations/store.ts).
 */
export function fuzzyCityCandidates(input: string, limit = CANDIDATE_LIMIT): CityCandidate[] {
  const token = (input ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (token.length < CANDIDATE_MIN_LENGTH || FUZZY_STOP_WORDS.has(token)) return [];

  const bestByName = new Map<string, CityCandidate>();
  const consider = (city: string, district: District, curated: boolean) => {
    const key = city.toLowerCase();
    const longest = Math.max(token.length, key.length);
    const distance = editDistance(token, key, longest);
    const similarity = 1 - distance / longest;
    if (similarity < CANDIDATE_MIN_SIMILARITY) return;
    const seen = bestByName.get(key);
    if (!seen || similarity > seen.similarity) {
      bestByName.set(key, { city, district, similarity, distance, curated });
    }
  };

  for (const c of CANDIDATES) consider(c.city, c.district, true);
  const bucket = extendedByPrefix?.get(token.slice(0, FUZZY_PREFIX_LENGTH));
  if (bucket) for (const e of bucket) consider(e.name, e.district as District, false);

  return [...bestByName.values()]
    .sort(
      (a, b) =>
        b.similarity - a.similarity ||
        // Ties are common and alphabetical order is meaningless to a reader:
        // for "Gampaga", Ampara and Gampola both score 0.71, and only one of
        // them looks like what was typed. Shared opening letters decide it.
        commonPrefixLength(token, b.city.toLowerCase()) -
          commonPrefixLength(token, a.city.toLowerCase()) ||
        Number(b.curated) - Number(a.curated) ||
        a.city.localeCompare(b.city)
    )
    .slice(0, limit);
}

function commonPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[i] === b[i]) i++;
  return i;
}

/**
 * True when the leader can be applied without asking. Every part matters: a
 * long input, a single edit, and a clear gap to the runner-up.
 */
export function isDecisiveCandidate(input: string, candidates: CityCandidate[]): boolean {
  if (!candidates.length) return false;
  const [first, second] = candidates;
  const token = (input ?? '').trim();
  if (token.length < CANDIDATE_CONFIDENT_MIN_LENGTH) return false;
  if (first.distance > 1) return false;
  return !second || first.similarity - second.similarity >= CANDIDATE_CONFIDENT_MARGIN;
}
