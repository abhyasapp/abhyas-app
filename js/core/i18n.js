// js/core/i18n.js — Nepali localization layer.
//
// The layer, not a half-translated app: everything else keeps working in
// English, and a string becomes bilingual the moment it is wrapped.
//
//   Static markup   <label data-i18n>Password</label>
//                   <input data-i18n-ph placeholder="Your password">
//                   <button data-i18n-aria aria-label="Show password">
//                   <div data-i18n-title title="Switch theme">
//
//   Generated text  I18N.t('Sign in')
//                   I18N.t('{n} to go · about {m}', { n: 10, m: '9m' })
//
// Keys are the English source text. That keeps call sites readable, means a
// missing translation degrades to English instead of a raw key, and lets
// data-i18n work without inventing an id for every sentence.
//
// The choice persists in localStorage and survives an offline session; it
// also sets <html lang> so screen readers and the browser's own UI agree.
(function () {
  'use strict';

  const LANG_KEY = 'abhyas_lang';
  const LANGS = { en: 'English', ne: 'नेपाली' };

  /* Every Nepali string the app currently uses. Add a line here, then add
     data-i18n="<English>" (or I18N.t) where it is shown. */
  const NE = {
    /* ── landing + auth ─────────────────────────────────────────── */
    'Skip to sign in': 'साइन इनमा जानुहोस्',
    'Switch theme': 'रङ बदल्नुहोस्',
    'Your path to mastery': 'तपाईंको सफलताको बाटो',
    'Loksewa Civil Engineering practice — online or offline': 'लोकसेवा सिभिल इन्जिनियरिङ अभ्यास — अनलाइन वा अफलाइन',
    'The Abhyas Loksewa app for Civil Engineering': 'सिभिल इन्जिनियरिङका लागि अभ्यास लोकसेवा एप',
    'Level 7 chapter practice, written answers and offline study — online or offline': 'लेभल ७ अध्याय अभ्यास, लिखित उत्तर र अफलाइन अध्ययन — अनलाइन वा अफलाइन',
    'Nepal · Level 7 Civil Engineering': 'नेपाल · तह ७ सिभिल इन्जिनियरिङ',
    'Offline first': 'अफलाइन पहिले',
    'Human marked': 'मानिसद्वारा जाँचिएको',
    'Built for phones': 'फोनका लागि बनाइएको',
    'Secure sign-in · Your progress stays private': 'सुरक्षित साइन इन · तपाईंको प्रगति निजी रहन्छ',
    'How it works': 'यो कसरी काम गर्छ',
    'A simple loop, built around the way exam preparation actually happens: pick up your phone, answer a few questions, and come back to what you missed.': 'परीक्षा तयारीको वास्तविक तरिकामा आधारित सरल चक्र: फोन उठाउनुहोस्, केही प्रश्नको उत्तर दिनुहोस्, र छुटेका कुरामा फर्केर आउनुहोस्।',
    'Pick a chapter': 'अध्याय छान्नुहोस्',
    'Start with the subject you are covering today, or let the 30-minute session choose for you.': 'आज पढ्ने विषयबाट सुरु गर्नुहोस्, वा ३० मिनेटको सत्रले तपाईंका लागि छान्न दिनुहोस्।',
    'Practice anywhere': 'जहाँ पनि अभ्यास गर्नुहोस्',
    'Open a chapter once. Your questions stay on your phone, ready for the bus or a power cut.': 'अध्याय एकपटक खोल्नुहोस्। तपाईंका प्रश्न फोनमै रहन्छन् — बसको यात्रा वा लोडसेडिङका लागि तयार।',
    'Review what matters': 'महत्त्वपूर्ण कुरा दोहोर्याउनुहोस्',
    'Missed questions return on a spaced schedule, with the most urgent ones first.': 'छुटेका प्रश्नहरू अन्तरालमा फर्केर आउँछन्, सबैभन्दा जरुरी पहिले।',
    "It keeps working when the power doesn't": 'बिजुली गए पनि चलिरहन्छ',
    'Open a chapter once while you have signal and its questions are saved to your phone. After that it opens during load-shedding, on the bus, or anywhere with no connection at all. New chapters need a connection the first time.': 'एकपटक इन्टरनेट हुँदा अध्याय खोल्नुहोस् — प्रश्नहरू फोनमा सुरक्षित हुन्छन्। त्यसपछि लोडसेडिङ, बसको यात्रा वा इन्टरनेट नभएको ठाउँमा पनि खुल्छ। नयाँ अध्यायका लागि पहिलो पटक इन्टरनेट चाहिन्छ।',
    'It tells you what to revise next': 'अब के दोहोर्याउने भनेर बताउँछ',
    "Accuracy per chapter, a daily streak, and a miss list that brings questions back on a spacing schedule until you've got them right four times, days apart. Your progress follows you to any device you sign in on.": 'अध्यायअनुसार शुद्धता, दैनिक स्ट्रिक र छुटेका प्रश्नको सूची — सही नभएसम्म केही दिनको अन्तरालमा प्रश्न फर्केर आउँछ। तपाईंले साइन इन गर्ने हरेक उपकरणमा प्रगति सँगै जान्छ।',
    'Written answers, marked by a person': 'लेखित उत्तर, व्यक्तिद्वारा जाँचिएको',
    'A timed question every day and full 100-mark papers on demand. Write on paper, photograph it, upload one PDF, and an admin marks it and sends feedback.': 'हरेक दिन समयबद्ध प्रश्न र आवश्यक परे १०० अंकको पूरा पत्र। कागजमा लेख्नुहोस्, फोटो खिच्नुहोस्, एउटा PDF अपलोड गर्नुहोस् — प्रशासकले जाँचेर प्रतिक्रिया पठाउँछन्।',
    'Free to try first': 'पहिले निःशुल्क प्रयास गर्नुहोस्',
    "Every new account gets a trial period with everything unlocked. Pay only once you know it's useful.": 'नयाँ खातामा सबै सुविधा खुला हुने परीक्षण अवधि पाइन्छ। उपयोगी लागेपछि मात्र भुक्तानी गर्नुहोस्।',
    'Start small. Stay consistent.': 'सानैबाट सुरु गर्नुहोस्। निरन्तर रहनुहोस्।',
    'One question is enough to begin.': 'सुरु गर्न एक प्रश्न नै पर्याप्त छ।',
    'Try a real Loksewa question without an account, then keep your progress across every device you study on.': 'खाता बिना नै वास्तविक लोकसेवा प्रश्न प्रयास गर्नुहोस्, त्यसपछि हरेक उपकरणमा आफ्नो प्रगति सुरक्षित राख्नुहोस्।',
    'Create a free account': 'निःशुल्क खाता खोल्नुहोस्',
    'Try a question': 'प्रश्न प्रयास गर्नुहोस्',
    'Checking the connection…': 'इन्टरनेट जाँच गर्दै…',
    'Welcome back': 'स्वागत छ',
    '— opening your dashboard.': '— तपाईंको ड्यासबोर्ड खोल्दै।',
    'Not you? Log out': 'तपाईं होइन? लगआउट गर्नुहोस्',
    'Checking your session…': 'तपाईंको सेसन जाँच गर्दै…',
    'Sign in': 'साइन इन',
    'Create account': 'खाता खोल्नुहोस्',
    'Username, email or mobile': 'प्रयोगकर्ता नाम, इमेल वा मोबाइल',
    'Password': 'पासवर्ड',
    'Your password': 'तपाईंको पासवर्ड',
    'Forgot your password?': 'पासवर्ड बिर्सनुभयो?',
    "Enter your username or the email on your account. If it matches, we'll email you a reset code.":
      'तपाईंको प्रयोगकर्ता नाम वा खाताको इमेल लेख्नुहोस्। मिलेमा पासवर्ड रिसेट कोड इमेल गरिनेछ।',
    'Username or email': 'प्रयोगकर्ता नाम वा इमेल',
    'Email me a code': 'कोड इमेल गर्नुहोस्',
    'Back to sign in': 'साइन इनमा फर्कनुहोस्',
    'Paste the code from your email, then choose a new password.': 'इमेलमा आएको कोड टाँस्नुहोस्, त्यसपछि नयाँ पासवर्ड राख्नुहोस्।',
    'Reset code': 'रिसेट कोड',
    'Paste the code': 'कोड टाँस्नुहोस्',
    'New password': 'नयाँ पासवर्ड',
    'At least 8 characters': 'कम्तीमा ८ अक्षर',
    'Set the new password': 'नयाँ पासवर्ड राख्नुहोस्',
    'Create my account': 'मेरो खाता खोल्नुहोस्',
    'Full name': 'पूरा नाम',
    'Your name': 'तपाईंको नाम',
    'Mobile': 'मोबाइल',
    'Email': 'इमेल',
    'you@example.com': 'you@example.com',
    'Username': 'प्रयोगकर्ता नाम',
    'Pick a username': 'प्रयोगकर्ता नाम छान्नुहोस्',
    'Letters, numbers, dots, dashes and underscores. At least 3 characters.':
      'अक्षर, अंक, डट, ड्यास र अन्डरस्कोर। कम्तीमा ३ अक्षर।',
    'Repeat password': 'पासवर्ड दोहोर्याउनुहोस्',
    'Type it again': 'फेरि टाइप गर्नुहोस्',
    'Show password': 'पासवर्ड देखाउनुहोस्',
    'Hide password': 'पासवर्ड लुकाउनुहोस्',

    /* ── student navigation (js/core/nav.js) ────────────────────── */
    'Home': 'गृहपृष्ठ',
    'Practice': 'अभ्यास',
    'Written answers': 'लेखन उत्तर',
    'Review': 'दोहोर्याउने',
    'Progress & plan': 'प्रगति र योजना',
    'Tools': 'औजार',
    'Review & progress': 'दोहोर्याउने र प्रगति',
    'Model answers & notes': 'नमुना उत्तर र नोट',
    'Weekly test': 'साप्ताहिक परीक्षा',
    'Hourly challenge': 'घण्टाको चुनौती',
    'Question of the day': 'आजको प्रश्न',
    'My submissions': 'मेरा पेस',
    'Full paper': 'पूरा पत्र',
    'Browse questions': 'प्रश्न हेर्नुहोस्',
    'Chapters': 'अध्याय',
    '60-day sprint': '६० दिने अभियान',
    'Open a file': 'फाइल खोल्नुहोस्',
    'Mixed practice': 'मिश्रित अभ्यास',
    'Saved': 'सुरक्षित',
    'Weak spots': 'कमजोर पक्ष',
    'Your progress': 'तपाईंको प्रगति',
    'Downloads': 'डाउनलोड',
    'Backup': 'ब्याकअप',
    'Study plan': 'अध्ययन योजना',
    'How this works': 'यो कसरी काम गर्छ',

    /* ── sprint page (js/features/sprint.js + user.html) ────────── */
    'Today': 'आज',
    "Today's targets": 'आजका लक्ष्यहरू',
    "Today's list": 'आजको सूची',
    'This week': 'यो हप्ता',
    '60-day journey': '६० दिने यात्रा',
    'Take today off': 'आज विश्राम लिनुहोस्',
    'Learn': 'सिकाइ',
    'Mock': 'मोक',
    'New': 'नयाँ',
    'Reviews': 'दोहोर्याउने',
    'Drill': 'अभ्यास',
    'Time': 'समय',
    'New questions': 'नयाँ प्रश्न',
    'Done': 'सकियो',
    /* ── Data & backup: display and storage cards (js/features/settings-ui.js) ── */
    'Theme': 'थिम',
    'Automatic follows your device.': 'स्वचालितले तपाईंको उपकरणको सेटिङ पछ्याउँछ।',
    'Light': 'उज्यालो',
    'Dark': 'अँध्यारो',
    'Automatic': 'स्वचालित',
    'Text size': 'अक्षरको आकार',
    'Makes questions and explanations easier to read.': 'प्रश्न र व्याख्या पढ्न सजिलो बनाउँछ।',
    'Normal': 'सामान्य',
    'Large': 'ठूलो',
    'Extra large': 'धेरै ठूलो',
    'Language': 'भाषा',
    'Menus and buttons. Questions stay in English.': 'मेनु र बटनहरू। प्रश्नहरू अङ्ग्रेजीमै रहन्छन्।',
    'Reduce motion': 'गति कम गर्नुहोस्',
    'Turns off animations and transitions.': 'एनिमेसन र संक्रमण बन्द गर्छ।',
    'Focus mode': 'फोकस मोड',
    'Hides streaks and badges while you study.': 'पढ्दा स्ट्रिक र ब्याज लुकाउँछ।',
    'On': 'चालू',
    'Off': 'बन्द',
    'Saved progress and notes': 'सुरक्षित प्रगति र नोट',
    'Progress, notes and settings': 'प्रगति, नोट र सेटिङ',
    '{a} of about {b} ({n}%)': '{b} मध्ये लगभग {a} ({n}%)',
    'Getting full. Download a backup. Nothing is ever deleted automatically.': 'भरिँदै छ। ब्याकअप डाउनलोड गर्नुहोस्। केही पनि आफैँ मेटिँदैन।',
    'Downloaded question sets': 'डाउनलोड गरिएका प्रश्न सेट',
    '{a} of {b} sets are saved for offline study.': 'अफलाइन अध्ययनका लागि {b} मध्ये {a} सेट सुरक्षित छन्।',
    '{a} sets are saved for offline study.': 'अफलाइन अध्ययनका लागि {a} सेट सुरक्षित छन्।',
    'Manage downloads': 'डाउनलोड व्यवस्थापन',
    'Used on this device': 'यस उपकरणमा प्रयोग भएको',
    '{a} of {b} available to Abhyas.': 'अभ्यासलाई उपलब्ध {b} मध्ये {a}।',
    'Protect my data': 'मेरो डेटा जोगाउनुहोस्',
    'Your browser will not clear Abhyas data when the device runs low on space.': 'उपकरणमा ठाउँ कम हुँदा ब्राउजरले अभ्यासको डेटा हटाउँदैन।',
    'Ask the browser not to clear Abhyas data when the device runs low on space.': 'उपकरणमा ठाउँ कम हुँदा ब्राउजरले अभ्यासको डेटा नहटाओस् भनी अनुरोध गर्नुहोस्।',
    'Protected': 'सुरक्षित',
    'Protect': 'जोगाउनुहोस्',
    'Download backup': 'ब्याकअप डाउनलोड',
    'Remove downloaded sets': 'डाउनलोड गरिएका सेट हटाउनुहोस्',
    'Your data is now protected.': 'तपाईंको डेटा अब सुरक्षित छ।',
    'The browser did not allow it. Installing Abhyas to your home screen usually helps.': 'ब्राउजरले अनुमति दिएन। अभ्यास होम स्क्रिनमा इन्स्टल गर्दा प्रायः मद्दत हुन्छ।',
    'Review due': 'दोहोर्याउन बाँकी',
    'Start': 'सुरु',
    'Continue': 'जारी राख्नुहोस्',
    'Open': 'खोल्नुहोस्',
    'All caught up ✓': 'सबै सकियो ✓',
    'Drill target met ✓': 'अभ्यास लक्ष्य पूरा भयो ✓',
    'Target met ✓ — extra practice is optional': 'लक्ष्य पूरा भयो ✓ — थप अभ्यास ऐच्छिक',
    '{n} to go · about {m}': '{n} बाँकी · करिब {m}',
    '{n} question · spaced repetition': '{n} प्रश्न · दोहोर्याइएको अभ्यास',
    '{n} questions · spaced repetition': '{n} प्रश्न · दोहोर्याइएको अभ्यास',
    '{n} from your weak chapters': 'कमजोर अध्यायबाट {n}',

    /* ── chapter grid mastery filter (js/features/chapter-nav.js) ─ */
    'All': 'सबै',
    'Not started': 'सुरु नभएको',
    'Practising': 'अभ्यास भइरहेको',
    'Strong': 'बलियो',
    'Coming soon': 'छिट्टै आउँदै',
    'Filter chapters by mastery': 'दक्षता अनुसार अध्याय छान्नुहोस्',
    'Show all chapters': 'सबै अध्याय देखाउनुहोस्',
    'Search chapters': 'अध्याय खोज्नुहोस्',
    'No chapters match your search.': 'तपाईंको खोजसँग मिल्ने अध्याय छैन।',
    'Clear search': 'खोज खाली गर्नुहोस्',
    'No chapters in this list yet.': 'यो सूचीमा अहिलेसम्म कुनै अध्याय छैन।',
    'Every chapter here is untouched. Pick one and start — your first answer moves it to Practising.':
      'यहाँका सबै अध्याय अझै सुरु भएका छैनन्। एउटा छानेर सुरु गर्नुहोस् — पहिलो उत्तरले यसलाई अभ्यास भइरहेको बनाउँछ।',
    'Nothing here yet. Work through a chapter and it joins this list.':
      'यहाँ अहिलेसम्म केही छैन। एउटा अध्याय पूरा गर्नुहोस्, त्यसपछि यो सूचीमा थपिन्छ।',
    'No strong chapters yet. Answer 85% or more of a chapter with nothing left in your wrong bank and it lands here.':
      'अहिलेसम्म कुनै बलियो अध्याय छैन। एउटा अध्यायको ८५% भन्दा बढी सही उत्तर दिनुहोस् र गलत बाँकी नरहनुहोस् — त्यसो भए यो यहाँ आउँछ।',
    'Ahead of schedule': 'तालिकाभन्दा अगाडि',
    'Behind schedule': 'तालिकाभन्दा पछाडि',
    'On track for exam day': 'परीक्षाको दिनसम्म ठीक बाटोमा',
    'Rest day': 'विश्राम दिन',
    'Nothing due': 'दोहोर्याउन केही बाँकी छैन',
    'You are all caught up for today.': 'आजको लागि सबै पूरा भयो।',
    'No new questions today. The plan has spread them over the other days.': 'आज नयाँ प्रश्न छैनन्। योजनाले तिनलाई अन्य दिनमा बाँडेको छ।',
    'Chapters appear here once your syllabus is counted.': 'पाठ्यक्रम गणना भएपछि अध्यायहरू यहाँ देखिन्छन्।',
    'Your daily reports appear here after your first day.': 'पहिलो दिनपछि तपाईंको दैनिक रिपोर्ट यहाँ देखिन्छ।',
    'No rest days planned.': 'कुनै विश्राम दिन तय गरिएको छैन।',
    'Nothing due for review right now 🎉': 'अहिले दोहोर्याउन केही बाँकी छैन 🎉',
    'Report copied. Paste it anywhere to share.': 'रिपोर्ट कपी भयो। जहाँसुकै टाँसेर साझा गर्नुहोस्।',
    'Pick a date first.': 'पहिले मिति छान्नुहोस्।',
    'Pick a date after today.': 'आजपछिको मिति छान्नुहोस्।',
    'Pick a valid exam date.': 'मान्य परीक्षा मिति छान्नुहोस्।',
    'That is too far away.': 'त्यो मिति धेरै टाढा छ।',
    'Exam date saved. Your plan has been re-spread.': 'परीक्षा मिति सुरक्षित भयो। तपाईंको योजना पुनः बाँडिएको छ।',
    'Syllabus counted. Your daily plan is ready.': 'पाठ्यक्रम गणना भयो। तपाईंको दैनिक योजना तयार छ।',
    'Count your syllabus first so a mock can be built.': 'मक बनाउन पहिले पाठ्यक्रम गणना गर्नुहोस्।',
    'Building your mock test…': 'तपाईंको मक परीक्षा बनाउँदै…',
    'Could not build a mock. Check your connection and try again.': 'मक बनाउन सकिएन। इन्टरनेट जाँचेर फेरि प्रयास गर्नुहोस्।',
    'Could not copy. Select the report and copy it manually.': 'कपी गर्न सकिएन। रिपोर्ट छानेर आफैँ कपी गर्नुहोस्।',
    'Count your syllabus first — there is no plan to export yet.': 'पहिले पाठ्यक्रम गणना गर्नुहोस् — निर्यात गर्न योजना छैन।',
    'Calendar downloaded. Import it into Google Calendar, Apple Calendar or Outlook.': 'क्यालेन्डर डाउनलोड भयो। यसलाई Google Calendar, Apple Calendar वा Outlook मा आयात गर्नुहोस्।',
    'Could not create the calendar file. Try again.': 'क्यालेन्डर फाइल बनाउन सकिएन। फेरि प्रयास गर्नुहोस्।',
    'Could not load this set. Open it once while online, then it works offline.': 'यो सेट लोड गर्न सकिएन। एकपटक अनलाइन हुँदा खोल्नुहोस्, त्यसपछि अफलाइन पनि चल्छ।',
    'That set is not available.': 'त्यो सेट उपलब्ध छैन।',
    'Nothing new is left in this set.': 'यो सेटमा अब नयाँ केही बाँकी छैन।',
    'Opening today’s questions…': 'आजका प्रश्नहरू खोल्दै…',
    'Every Level 7 and GK question has been seen.': 'लेभल ७ र सामान्य ज्ञानका सबै प्रश्न हेरिसकियो।',
    'Every Level 7 and GK question has been seen. Time to sharpen.': 'लेभल ७ र सामान्य ज्ञानका सबै प्रश्न हेरिसकियो। अब अभ्यास तिखार्ने बेला।',
    'Every question in your focus has been seen.': 'तपाईंले छानेका सबै विषयका प्रश्न हेरिसकियो।',
    'Every question in your focus has been seen. Time to sharpen.': 'तपाईंले छानेका सबै विषयका प्रश्न हेरिसकियो। अब अभ्यास तिखार्ने बेला।',
    'All Level 7 + GK topics': 'सबै लेभल ७ + सामान्य ज्ञान विषय',
    'Focus topics': 'फोकस विषय',
    'Add to calendar': 'क्यालेन्डरमा थप्नुहोस्',
    'Choose topics': 'विषय छान्नुहोस्',
    'No topics selected': 'कुनै विषय छानिएको छैन',
    'No topics are available yet. Open a chapter once while online.': 'अझै कुनै विषय उपलब्ध छैन। अनलाइन हुँदा एकपटक अध्याय खोल्नुहोस्।',
    'Choose the topics you want the plan to cover. You can mix Level 7, Level 5 and GK.': 'योजनामा समेट्न चाहेका विषय छान्नुहोस्। लेभल ७, लेभल ५ र सामान्य ज्ञान मिसाउन सकिन्छ।',
    'All levels': 'सबै लेभल',
    'Level 7 + GK': 'लेभल ७ + सामान्य ज्ञान',
    'Search topics…': 'विषय खोज्नुहोस्…',
    'Select all topics in this level': 'यो लेभलका सबै विषय छान्नुहोस्',
    '~{m} left today': 'आज अझै ~{m} बाँकी',
    'All targets done': 'सबै लक्ष्य पूरा भयो',
    'Start all': 'सबै सुरु गर्नुहोस्',
    'Expected': 'अपेक्षित',
    'Actual': 'वास्तविक',
    'Projected': 'अनुमानित',
    'Q/day': 'प्रश्न/दिन',
    'Today’s new questions': 'आजका नयाँ प्रश्नहरू',
    'Clear': 'खाली गर्नुहोस्',
    'topics': 'विषय',
    'Use these topics': 'यी विषय प्रयोग गर्नुहोस्',
    'topics selected': 'विषय छानियो',
    'Choose at least one topic.': 'कम्तीमा एउटा विषय छान्नुहोस्।',
    'Focus saved. Daily targets now cover only these topics.': 'फोकस सुरक्षित भयो। दैनिक लक्ष्यले अब यी विषय मात्र समेट्छ।',
    'Catch up today': 'आजको छुटेको पूरा गर्नुहोस्',
    'Catch up': 'छुटेको पूरा गर्नुहोस्',
    'Nothing new left to catch up on today.': 'आज पूरा गर्न नयाँ प्रश्न बाँकी छैन।',
    'Building your catch-up block…': 'तपाईंको क्याच-अप ब्लक बनाउँदै…',
    'Could not load today’s chapters. Try again.': 'आजका अध्याय लोड गर्न सकिएन। फेरि प्रयास गर्नुहोस्।',
    'Sprint catch-up': 'स्प्रिन्ट क्याच-अप',
    'Your drill appears once you have a few missed questions. Keep practising.': 'केही गलत प्रश्न भएपछि तपाईंको ड्रिल देखिन्छ। अभ्यास जारी राख्नुहोस्।',
    'Nothing scheduled yet.': 'अहिलेसम्म केही तालिकामा छैन।',
    'Set up your syllabus': 'पाठ्यक्रम सेटअप गर्नुहोस्',
    'Set up': 'सेटअप',
    'Set up your syllabus to get daily chapters': 'दैनिक अध्यायहरू पाउन पाठ्यक्रम सेटअप गर्नुहोस्',
    'Count the questions so every chapter gets a day': 'हरेक अध्यायले आफ्नो दिन पाओस् भनेर प्रश्न गणना गर्नुहोस्',
    'Connect to the internet once to count your syllabus.': 'पाठ्यक्रम गणना गर्न एकपटक इन्टरनेटमा जोडिनुहोस्।',
    'Syllabus complete': 'पाठ्यक्रम पूरा',
    'Syllabus still unfinished': 'पाठ्यक्रम अझै अधुरो',
    'Needs the most work': 'सबैभन्दा बढी मेहनत चाहिने',
    'In progress': 'जारी छ',
    'No practice': 'अभ्यास भएन',
    'Not used': 'प्रयोग भएन',
    'Starts after your first session': 'पहिलो सत्रपछि सुरु हुन्छ',
    'Mock test': 'मक परीक्षा',
    'Timed mock test': 'समयबद्ध मक परीक्षा',
    'Sprint mock test': 'स्प्रिन्ट मक परीक्षा',
    'Drill your weak spots': 'कमजोर क्षेत्रमा अभ्यास गर्नुहोस्',
    'New questions for today': 'आजका नयाँ प्रश्नहरू',
    'Resets at midnight': 'मध्यरातमा रिसेट हुन्छ',
    'Today is a rest day. The other days carry a little more.': 'आज विश्राम दिन हो। अन्य दिनमा अलि बढी पर्छ।',
    'none due ✓': 'दोहोर्याउन बाँकी छैन ✓',
    'Counting your syllabus…': 'पाठ्यक्रम गणना गर्दै…',
    'Count now': 'अहिले गणना गर्नुहोस्',
    'Sprint grade': 'स्प्रिन्ट ग्रेड',
    'Active days': 'सक्रिय दिन',
    'All covered — raise accuracy to 85%': 'सबै समेटियो — शुद्धता ८५% पुर्‍याउनुहोस्',
    'Accuracy goal': 'शुद्धता लक्ष्य',
    'No accuracy data yet': 'अहिलेसम्म शुद्धताको तथ्याङ्क छैन',
    'Accuracy is {a}%. Bring every chapter to {g}% to finish.': 'शुद्धता {a}% छ। सिध्याउन हरेक अध्याय {g}% पुर्‍याउनुहोस्।',
    'Reset chapter progress': 'अध्यायको प्रगति रिसेट गर्नुहोस्',
    'Reset chapter progress?': 'अध्यायको प्रगति रिसेट गर्ने?',
    'Reset is not available right now.': 'रिसेट अहिले उपलब्ध छैन।',
    'Reset': 'रिसेट',
    'Clear all practice progress for {chapter}? This removes its sessions, accuracy, coverage and missed questions. Bookmarks, flags and notes are kept.': '{chapter} को सबै अभ्यास प्रगति मेट्ने? यसले यसका सत्र, शुद्धता, कभरेज र छुटेका प्रश्नहरू हटाउँछ। बुकमार्क, झन्डा र नोटहरू सुरक्षित रहन्छन्।',
    'Nothing to reset in this chapter.': 'यो अध्यायमा रिसेट गर्न केही छैन।',
    'Chapter progress reset': 'अध्यायको प्रगति रिसेट भयो',
    'Sessions: {sessions} · Answered: {answered} · Missed: {missed}.': 'सत्र: {sessions} · उत्तर दिइएका: {answered} · छुटेका: {missed}।',
    'Reset this set': 'यो सेट रिसेट गर्नुहोस्',
    'Reset set progress?': 'सेटको प्रगति रिसेट गर्ने?',
    'Clear progress for {set}? This removes its coverage, missed questions and the answers it recorded inside chapter sessions. Bookmarks, flags and notes are kept.': 'सेट {set}को प्रगति मेट्ने? यसले यसको कभरेज, छुटेका प्रश्न र अध्याय सत्रभित्र यसले रेकर्ड गरेका उत्तरहरू हटाउँछ। बुकमार्क, फ्ल्याग र नोटहरू रहिरहन्छन्।',
    'Nothing to reset in this set.': 'यो सेटमा रिसेट गर्न केही छैन।',
    'Set progress reset': 'सेटको प्रगति रिसेट भयो',

    /* ── full landing page ─────────────────────────────────────── */
    'Why students choose Abhyas': 'विद्यार्थीले अभ्यास किन रोज्छन्',
    'Cookie notice': 'कुकी सूचना',
    'Abhyas keeps you signed in and saves your progress on this device. No ads, no tracking.': 'अभ्यासले तपाईंलाई साइन इन राख्छ र यही उपकरणमा प्रगति सुरक्षित गर्छ। विज्ञापन छैन, ट्र्याकिङ छैन।',
    'Privacy': 'गोपनीयता',
    'Terms': 'सर्तहरू',
    'Got it': 'बुझें',
    'No account needed. Here is the kind of practice you get.': 'खाता आवश्यक छैन। तपाईंले पाउने अभ्यासको नमुना यही हो।',
    'Another question': 'अर्को प्रश्न',
    'The minimum grade of concrete for reinforced cement concrete work as per IS 456:2000 is:': 'IS 456:2000 अनुसार प्रबलित सिमेन्ट कंक्रिट (RCC) कार्यका लागि कंक्रिटको न्यूनतम ग्रेड कुन हो?',
    'IS 456 mandates M20 as the minimum grade for RCC work in general, to ensure adequate durability and strength.': 'IS 456 ले सामान्यतया RCC कार्यका लागि पर्याप्त टिकाउपन र बल सुनिश्चित गर्न M20 लाई न्यूनतम ग्रेड तोकेको छ।',
    'Which of the following is the unit of dynamic viscosity?': 'तलका मध्ये कुन गतिशील श्यानताको एकाइ हो?',
    'Dynamic viscosity (μ) is measured in pascal-seconds (Pa·s), equivalent to N·s/m².': 'गतिशील श्यानता (μ) पास्कल-सेकेन्ड (Pa·s) मा मापिन्छ, जुन N·s/m² सँग बराबर हुन्छ।',
    'The maximum permissible free fall of concrete during placement is approximately:': 'कंक्रिट राख्दा अनुमत अधिकतम स्वतन्त्र खसाइ करिब कति हुन्छ?',
    'As per IS 456, concrete should not be dropped from a height exceeding 1.5 m to prevent segregation.': 'IS 456 अनुसार कंक्रिट छुट्टिनबाट रोक्न १.५ मिटरभन्दा बढी उचाइबाट खसाल्नु हुँदैन।',
    'What Abhyas is': 'अभ्यास के हो',
    "Abhyas is a Civil Loksewa practice app for Nepal's Lok Sewa Aayog Level 7 Civil Engineering exam. It includes chapter-wise technical questions plus General Knowledge practice alongside them.": 'अभ्यास नेपालको लोक सेवा आयोग तह ७ सिभिल इन्जिनियरिङ परीक्षाका लागि बनाइएको सिभिल लोकसेवा अभ्यास एप हो। यसमा अध्यायअनुसार प्राविधिक प्रश्नहरूसँगै सामान्य ज्ञानको अभ्यास पनि समावेश छ।',
    'Subjects covered': 'समेटिएका विषयहरू',
    'Structural Engineering': 'संरचना इन्जिनियरिङ',
    'Engineering Survey': 'इन्जिनियरिङ सर्वेक्षण',
    'Construction Materials': 'निर्माण सामग्री',
    'Concrete Technology': 'कंक्रिट प्रविधि',
    'Geotechnical Engineering': 'भूप्राविधिक इन्जिनियरिङ',
    'Construction Management': 'निर्माण व्यवस्थापन',
    'Estimating & Costing': 'अनुमान र लागत',
    'Engineering Drawing': 'इन्जिनियरिङ चित्रण',
    'Engineering Economics': 'इन्जिनियरिङ अर्थशास्त्र',
    'Professional Practices': 'व्यावसायिक अभ्यास',
    'General Knowledge': 'सामान्य ज्ञान',
    'The Level 7 Civil Engineering paper': 'तह ७ सिभिल इन्जिनियरिङ पत्र',
    'Abhyas follows the Lok Sewa Aayog Level 7 Civil Engineering syllabus: the technical paper, the objective paper and General Knowledge. For written practice, the 100-mark paper is organised into four groups:': 'अभ्यासले लोक सेवा आयोग तह ७ सिभिल इन्जिनियरिङ पाठ्यक्रम पछ्याउँछ: प्राविधिक पत्र, वस्तुगत पत्र र सामान्य ज्ञान। लेखित अभ्यासका लागि १०० अंकको पत्र चार समूहमा विभाजित छ:',
    'Written-paper groups and marks, as covered in Abhyas': 'लेखित पत्रका समूह र अंक, अभ्यासमा समेटिएअनुसार',
    'Group': 'समूह',
    'Subjects': 'विषयहरू',
    'Marks': 'अंक',
    'Structure and Geotechnical Engineering': 'संरचना र भूप्राविधिक इन्जिनियरिङ',
    'Water Resource and Irrigation': 'जलस्रोत र सिँचाइ',
    'Transportation Engineering': 'यातायात इन्जिनियरिङ',
    'Public Health, Project Management and Professional Practice': 'जनस्वास्थ्य, परियोजना व्यवस्थापन र व्यावसायिक अभ्यास',
    'Topics practised': 'अभ्यास गरिने विषयवस्तु',
    'Reinforced concrete structures': 'प्रबलित कंक्रिट संरचना',
    'Steel and timber structures': 'स्टिल र काठ संरचना',
    'Earthquake-resistant buildings': 'भूकम्प प्रतिरोधी भवन',
    'Structural design of bridges': 'पुलको संरचनात्मक डिजाइन',
    'Soil mechanics': 'माटो यान्त्रिकी',
    'Foundation engineering': 'जग इन्जिनियरिङ',
    'Site investigation': 'स्थल अन्वेषण',
    'Hydrology and sediment': 'जलविज्ञान र तलछट',
    'Hydraulics': 'जलगतिकी',
    'Irrigation': 'सिँचाइ',
    'Hydropower': 'जलविद्युत्',
    'Highway engineering': 'राजमार्ग इन्जिनियरिङ',
    'Airport engineering': 'विमानस्थल इन्जिनियरिङ',
    'Water supply': 'खानेपानी आपूर्ति',
    'Sanitation and sewerage': 'सरसफाइ र ढल',
    'Environment': 'वातावरण',
    'Project management': 'परियोजना व्यवस्थापन',
    'Quantity surveying': 'परिमाण सर्वेक्षण',
    'Ethics and codes': 'नैतिकता र मापदण्ड',
    "Each topic has chapter-wise practice questions, and the written-answer bank uses the same groups. Exam patterns change, so confirm the current year's marks in the notice published by the Lok Sewa Aayog before you rely on any split.": 'प्रत्येक विषयवस्तुमा अध्यायअनुसार अभ्यास प्रश्न छन्, र लेखित उत्तर संग्रहले पनि यही समूह प्रयोग गर्छ। परीक्षाको ढाँचा परिवर्तन हुन सक्छ, त्यसैले कुनै पनि अंक विभाजनमा भर पर्नुअघि लोक सेवा आयोगले प्रकाशित गरेको चालु वर्षको सूचनामा पुष्टि गर्नुहोस्।',
    'Common questions': 'सामान्य प्रश्नहरू',
    'What is Abhyas Civil Loksewa?': 'अभ्यास सिभिल लोकसेवा के हो?',
    "Abhyas is a Civil Loksewa practice app for Nepal's Level 7 Civil Engineering exam. It combines chapter-wise questions, offline study and written-answer practice marked by a person.": 'अभ्यास नेपालको तह ७ सिभिल इन्जिनियरिङ परीक्षाका लागि सिभिल लोकसेवा अभ्यास एप हो। यसले अध्यायअनुसार प्रश्न, अफलाइन अध्ययन र व्यक्तिद्वारा जाँचिने लेखित उत्तर अभ्यासलाई एकै ठाउँमा जोड्छ।',
    'What is Lok Sewa Aayog?': 'लोक सेवा आयोग के हो?',
    "Nepal's Public Service Commission. It runs the civil service examinations, including the Level 7 Civil Engineering exam that Abhyas is built around.": 'नेपालको लोक सेवा आयोग। यसले निजामती सेवा परीक्षाहरू सञ्चालन गर्छ, जसमा अभ्यास केन्द्रित तह ७ सिभिल इन्जिनियरिङ परीक्षा पनि पर्छ।',
    'Can I really use it with no internet?': 'के म इन्टरनेट बिना साँच्चै प्रयोग गर्न सक्छु?',
    "Yes, for anything you've opened before. Once a chapter or subtopic has loaded while you were online, it stays on your device and opens with no connection. You can also download everything at once from the Downloads screen.": 'हो, तपाईंले पहिले खोलिसकेका सामग्रीका लागि। अध्याय वा उपविषय एकपटक अनलाइन हुँदा लोड भएपछि त्यो उपकरणमै रहन्छ र इन्टरनेट बिना खुल्छ। डाउनलोड स्क्रिनबाट सबै एकैपटक डाउनलोड पनि गर्न सक्नुहुन्छ।',
    'What does it cost?': 'यसको शुल्क कति हो?',
    "New accounts start on a free trial with full access. After that there's a one-time payment of": 'नयाँ खातामा पूर्ण पहुँचसहित निःशुल्क परीक्षण सुरु हुन्छ। त्यसपछि एकपटक मात्र तिर्नुपर्ने शुल्क',
    'a small amount': 'सानो रकम',
    '; the QR code is on the payment screen once your trial ends.': '; परीक्षण सकिएपछि भुक्तानी स्क्रिनमा QR कोड देखिन्छ।',
    'Is my progress safe if I change phone?': 'फोन बदल्दा मेरो प्रगति सुरक्षित रहन्छ?',
    "Yes. Progress backs up to your Abhyas account whenever you're online, and you can restore it on a new device by signing in. You can also keep a second copy in your own Google Drive, or export a backup file.": 'हो। अनलाइन हुँदा तपाईंको प्रगति अभ्यास खातामा ब्याकअप हुन्छ, र नयाँ उपकरणमा साइन इन गरेर पुनःस्थापना गर्न सक्नुहुन्छ। आफ्नै Google Drive मा दोस्रो प्रतिलिपि राख्न वा ब्याकअप फाइल निर्यात गर्न पनि सक्नुहुन्छ।',
    'I forgot my password.': 'मैले पासवर्ड बिर्सें।',
    'Use "Forgot your password?" on the sign-in form. If the username or email matches an account, a reset code goes to that account\'s email address.': 'साइन इन फारमको "पासवर्ड बिर्सनुभयो?" प्रयोग गर्नुहोस्। प्रयोगकर्ता नाम वा इमेल कुनै खातासँग मिल्यो भने त्यो खाताको इमेल ठेगानामा रिसेट कोड जान्छ।',
    'Abhyas — Civil Loksewa practice for Nepal': 'अभ्यास — नेपालका लागि सिभिल लोकसेवा अभ्यास',
    'Updated 4 November 2026': 'अद्यावधिक ४ नोभेम्बर २०२६',
    'Updated 13 November 2026': 'अद्यावधिक १३ नोभेम्बर २०२६'
  };

  const DICTS = { en: null, ne: NE };

  function storedLang() {
    try {
      const v = localStorage.getItem(LANG_KEY);
      if (v === 'en' || v === 'ne') return v;
    } catch (e) { window.warnCaught && window.warnCaught('js/core/i18n.js', e); }
    return null;
  }

  function detectLang() {
    const saved = storedLang();
    if (saved) return saved;
    try {
      const nav = String(navigator.language || '');
      if (/^ne\b/i.test(nav)) return 'ne';
    } catch (e) { window.warnCaught && window.warnCaught('js/core/i18n.js', e); }
    return 'en';
  }

  function applyDocumentLang(lang) {
    try { document.documentElement.setAttribute('lang', lang === 'ne' ? 'ne-NP' : 'en-NP'); } catch (e) { window.warnCaught && window.warnCaught('js/core/i18n.js', e); }
  }

  const I18N = {
    LANGS,
    lang: 'en',

    t(key, vars) {
      const dict = DICTS[this.lang];
      let out = (dict && dict[key]) || key;
      if (vars) {
        out = out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
      }
      return out;
    },

    /* Translate the current DOM. Safe to call repeatedly: the English text
       of each node is snapshotted on the first pass, so switching back to
       English restores the original markup instead of the translation. */
    applyStatic(root) {
      const scope = root || document;
      scope.querySelectorAll('[data-i18n]').forEach(el => {
        if (el.dataset.i18nSrc == null) el.dataset.i18nSrc = el.textContent;
        const english = el.getAttribute('data-i18n') || el.dataset.i18nSrc;
        el.textContent = this.t(english);
      });
      scope.querySelectorAll('[data-i18n-ph]').forEach(el => {
        if (el.dataset.i18nPhSrc == null) el.dataset.i18nPhSrc = el.getAttribute('placeholder') || '';
        el.setAttribute('placeholder', this.t(el.getAttribute('data-i18n-ph') || el.dataset.i18nPhSrc));
      });
      scope.querySelectorAll('[data-i18n-aria]').forEach(el => {
        if (el.dataset.i18nAriaSrc == null) el.dataset.i18nAriaSrc = el.getAttribute('aria-label') || '';
        el.setAttribute('aria-label', this.t(el.getAttribute('data-i18n-aria') || el.dataset.i18nAriaSrc));
      });
      scope.querySelectorAll('[data-i18n-title]').forEach(el => {
        const src = el.getAttribute('data-i18n-title');
        if (src) el.setAttribute('title', this.t(src));
      });
      /* The switcher always names the language you would switch TO. */
      document.querySelectorAll('[data-lang-label]').forEach(el => {
        const to = this.lang === 'ne' ? 'en' : 'ne';
        el.textContent = LANGS[to];
        el.setAttribute('lang', to);   /* screen readers pronounce the label in its own language */
      });
    },

    setLang(lang, opts) {
      const next = lang === 'ne' ? 'ne' : 'en';
      this.lang = next;
      try { localStorage.setItem(LANG_KEY, next); } catch (e) { window.warnCaught && window.warnCaught('js/core/i18n.js', e); }
      applyDocumentLang(next);
      this.applyStatic(document);
      /* Navigation is built from English data on purpose — re-render it so
         the sidebar, page headers and phone sheet follow the switch. */
      try { if (window.NAV) { NAV.renderSidebar(); NAV.renderHeads(); } } catch (e) { window.warnCaught && window.warnCaught('js/core/i18n.js', e); }
      try {
        document.dispatchEvent(new CustomEvent('abhyas:lang', { detail: { lang: next } }));
      } catch (e) { window.warnCaught && window.warnCaught('js/core/i18n.js', e); }
      if (!(opts && opts.silent) && typeof toast === 'function') {
        toast(next === 'ne' ? 'भाषा नेपालीमा बदलियो' : 'Language set to English');
      }
      return next;
    },

    toggleLang() {
      return this.setLang(this.lang === 'ne' ? 'en' : 'ne');
    }
  };

  I18N.lang = detectLang();
  applyDocumentLang(I18N.lang);

  window.I18N = I18N;

  function boot() { I18N.applyStatic(document); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
