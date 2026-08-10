/**
 * Machine-drafted Arabic names, muscle-group labels, and equipment labels for
 * the F2 SEO exercise pages. Every string here was written by an LLM, not a
 * native speaker. Ameen waived native-speaker review (see memory), but the
 * data must never imply otherwise.
 *
 * Rule: every SEO JSON page that displays Arabic text MUST carry the
 * `"_draft"` marker the build script injects. If a page omits it, someone
 * forgot to pull the marker through.
 *
 * DO NOT import this file from `src/`. It exists only for the build-time
 * scripts and their tests.
 */

// ---------------------------------------------------------------------------
// Muscle-group labels (11 schema-legal values → Arabic)
// ---------------------------------------------------------------------------

export const ARABIC_MUSCLE_GROUPS: Record<string, string> = {
  chest: 'الصدر',
  back: 'الظهر',
  shoulders: 'الكتفين',
  biceps: 'البايسيبس',
  triceps: 'الترايسيبس',
  quads: 'الفخذ الأمامي',
  hamstrings: 'أوتار الركبة',
  glutes: 'الألوية',
  calves: 'السمانة',
  core: 'الجذع',
  cardio: 'القلب',
}

// ---------------------------------------------------------------------------
// Equipment labels
// ---------------------------------------------------------------------------

export const ARABIC_EQUIPMENT: Record<string, string> = {
  barbell: 'بار',
  dumbbell: 'دمبل',
  cable: 'كابل',
  machine: 'جهاز',
  bodyweight: 'وزن الجسم',
  other: 'أخرى',
}

// ---------------------------------------------------------------------------
// Machine-drafted exercise names (134 seeded exercises)
//
// The key is the English name exactly as stored in the DB. The value is an
// Arabic rendering: translated where natural, transliterated where Arabic
// speakers would actually search in Latin letters (e.g. "بنش برس",
// "سكركرشر", "بلانك").
//
// Any seeded exercise NOT in this map falls back to the pattern
// "<muscle-group> <equipment>" in Arabic (see draftArabicName).
// ---------------------------------------------------------------------------

export const ARABIC_NAMES: Record<string, string> = {
  // --- Biceps ---
  '21s Bicep Curl': 'تجديع 21 للبايسيبس',
  'Bicep Curl (Barbell)': 'تجديع البايسيبس (بار)',
  'Bicep Curl (Cable)': 'تجديع البايسيبس (كابل)',
  'Bicep Curl (Dumbbell)': 'تجديع البايسيبس (دمبل)',
  'Behind the Back Curl (Cable)': 'تجديع خلف الظهر (كابل)',
  'Behind the Back Wrist Curl (Barbell)': 'تجديع المعصم خلف الظهر (بار)',
  'Concentration Curl': 'تجديع التركيز',
  'EZ Bar Biceps Curl': 'تجديع البايسيبس (بار EZ)',
  'Hammer Curl (Dumbbell)': 'تجديع المطرقة (دمبل)',
  'Preacher Curl (Dumbbell)': 'تجديع على المقعد (دمبل)',
  'Preacher Curl (Machine)': 'تجديع على المقعد (جهاز)',
  'Reverse Curl (Cable)': 'تجديع عكسي (كابل)',
  'Reverse Grip Concentration Curl': 'تجديع التركيز بقبضة عكسية',
  'Seated Incline Curl (Dumbbell)': 'تجديع مائل جالس (دمبل)',

  // --- Triceps ---
  'Bench Dip': 'غطس على البنش',
  'Bench Press - Close Grip (Barbell)': 'بنش برس بقبضة ضيقة (بار)',
  'Cable Crunch': 'كرنش (كابل)',
  'Overhead Triceps Extension (Cable)': 'تمديد الترايسبس علوي (كابل)',
  'Seated Dip Machine': 'غطس جالس (جهاز)',
  'Seated Wrist Extension (Barbell)': 'تمديد المعصم جالس (بار)',
  'Skullcrusher (Barbell)': 'سكركرشر (بار)',
  'Skullcrusher (Dumbbell)': 'سكركرشر (دمبل)',
  'Triceps Extension (Cable)': 'تمديد الترايسبس (كابل)',
  'Triceps Extension (Dumbbell)': 'تمديد الترايسبس (دمبل)',
  'Triceps Kickback (Cable)': 'ركلة الترايسبس (كابل)',
  'Triceps Kickback (Dumbbell)': 'ركلة الترايسبس (دمبل)',
  'Triceps Pressdown': 'دفع الترايسبس للأسفل',
  'Triceps Pushdown': 'دفع الترايسبس للأسفل',
  'Triceps Rope Pushdown': 'دفع الترايسبس بالحبل',

  // --- Chest ---
  'Around The World': 'حول العالم',
  'Bench Press (Barbell)': 'بنش برس (بار)',
  'Bench Press (Cable)': 'بنش برس (كابل)',
  'Bench Press (Dumbbell)': 'بنش برس (دمبل)',
  'Cable Fly Crossovers': 'فراشة الكابل',
  'Chest Dip': 'غطس الصدر',
  'Chest Fly (Dumbbell)': 'فراشة الصدر (دمبل)',
  'Chest Fly (Machine)': 'فراشة الصدر (جهاز)',
  'Chest Press (Machine)': 'ضغط الصدر (جهاز)',
  'Dumbbell Squeeze Press': 'ضغط الضغط (دمبل)',
  'Hex Press (Dumbbell)': 'هركس برس (دمبل)',
  'Iso-Lateral Chest Press (Machine)': 'ضغط الصدر الجانبي (جهاز)',
  'Low Cable Fly Crossovers': 'فراشة الكابل المنخفضة',
  'Push Up': 'تمرين الضغط',
  'Chest Supported Incline Row (Dumbbell)': 'سحب مائل مستند للصدر (دمبل)',

  // --- Back ---
  'Back Extension (Machine)': 'امتداد الظهر (جهاز)',
  'Back Extension (Weighted Hyperextension)': 'امتداد الظهر (بأوزان)',
  'Bent Over Row (Barbell)': 'سحب منحني (بار)',
  'Chin Up': 'شد بالذقن',
  'Chest Supported Row (Machine)': 'سحب مستند للصدر (جهاز)',
  'Dumbbell Row': 'سحب دمبل',
  'Iso-Lateral High Row (Machine)': 'سحب مرتفع الجانبي (جهاز)',
  'Iso-Lateral Row (Machine)': 'سحب جانبي (جهاز)',
  'Landmine Row': 'سحب لاندمين',
  'Lat Pulldown (Cable)': 'سحب لات (كابل)',
  'Lat Pulldown (Machine)': 'سحب لات (جهاز)',
  'Lat Pulldown - Close Grip (Cable)': 'سحب لات بقبضة ضيقة (كابل)',
  'Pendlay Row (Barbell)': 'سحب بندلاي (بار)',
  'Pull Up': 'شد علوي',
  'Pullover (Dumbbell)': 'بول أوفر (دمبل)',
  'Pullover (Machine)': 'بول أوفر (جهاز)',
  'Rear Delt Reverse Fly (Cable)': 'فراشة عكسية للدلت الخلفية (كابل)',
  'Rear Delt Reverse Fly (Machine)': 'فراشة عكسية للدلت الخلفية (جهاز)',
  'Reverse Grip Lat Pulldown (Cable)': 'سحب لات بقبضة عكسية (كابل)',
  'Seated Cable Row - Bar Grip': 'سحب كابل جالس بقبضة مستقيمة',
  'Seated Cable Row - Bar Wide Grip': 'سحب كابل جالس بقبضة عريضة',
  'Seated Cable Row - V Grip (Cable)': 'سحب كابل جالس بقبضة V (كابل)',
  'Seated Row (Machine)': 'سحب جالس (جهاز)',
  'Shrug (Barbell)': 'هزة الكتفين (بار)',
  'Shrug (Dumbbell)': 'هزة الكتفين (دمبل)',
  'Shrug (Machine)': 'هزة الكتفين (جهاز)',
  'Single Arm Cable Row': 'سحب كابل بذراع واحدة',
  'Straight Arm Lat Pulldown (Cable)': 'سحب لات بذراع ممدودة (كابل)',
  'T Bar Row': 'سحب بار T',

  // --- Shoulders ---
  'Face Pull': 'شد الوجه',
  'Front Raise (Cable)': 'رفع أمامي (كابل)',
  'Front Raise (Dumbbell)': 'رفع أمامي (دمبل)',
  'Lateral Raise (Dumbbell)': 'رفع جانبي (دمبل)',
  'Overhead Press (Barbell)': 'الضغط العلوي (بار)',
  'Seated Lateral Raise (Dumbbell)': 'رفع جانبي جالس (دمبل)',
  'Seated Shoulder Press (Machine)': 'ضغط الكتف جالس (جهاز)',
  'Shoulder Press (Dumbbell)': 'ضغط الكتف (دمبل)',
  'Shoulder Press (Machine Plates)': 'ضغط الكتف (جهاز)',
  'Single Arm Landmine Press (Barbell)': 'ضغط لاندمين بذراع واحدة (بار)',
  'Single Arm Lateral Raise (Cable)': 'رفع جانبي بذراع واحدة (كابل)',

  // --- Quads ---
  'Bulgarian Split Squat (Dumbbell)': 'سكوات بلغاري (دمبل)',
  'Front Squat': 'سكوات أمامي',
  'Full Squat': 'سكوات كامل',
  'Hip Adduction (Machine)': 'إضافة الورك (جهاز)',
  'Leg Extension (Machine)': 'تمديد الساق (جهاز)',
  'Leg Press (Machine)': 'ضغط الساق (جهاز)',
  Lunge: 'لنج',
  'Lunge (Barbell)': 'لنج (بار)',
  'Lunge (Dumbbell)': 'لنج (دمبل)',
  'Squat (Barbell)': 'سكوات (بار)',
  'Squat (Smith Machine)': 'سكوات (جهاز سميث)',
  'Sumo Squat (Dumbbell)': 'سكوات سومو (دمبل)',
  'Walking Lunge (Dumbbell)': 'لنج المشي (دمبل)',

  // --- Hamstrings ---
  'Glute Ham Raise': 'رفع الألوية مع أوتار الركبة',
  'Lying Leg Curl (Machine)': 'ثني الساق راقد (جهاز)',
  'Romanian Deadlift (Barbell)': 'الرفعة الرومانية (بار)',
  'Romanian Deadlift (Dumbbell)': 'الرفعة الرومانية (دمبل)',
  'Seated Leg Curl (Machine)': 'ثني الساق جالس (جهاز)',

  // --- Glutes ---
  'Glute Bridge': 'جسر الألوية',
  'Hip Abduction (Machine)': 'تبعيد الورك (جهاز)',
  'Hip Thrust (Machine)': 'دفع الورك (جهاز)',
  'Hip Thrust (Smith Machine)': 'دفع الورك (جهاز سميث)',
  'Rear Kick (Machine)': 'ركلة خلفية (جهاز)',

  // --- Calves ---
  'Calf Press (Machine)': 'ضغط السمانة (جهاز)',
  'Seated Calf Raise': 'رفع السمانة جالس',
  'Single Leg Standing Calf Raise (Machine)': 'رفع السمانة بساق واحدة واقفاً (جهاز)',
  'Standing Calf Raise': 'رفع السمانة واقفاً',
  'Standing Calf Raise (Machine)': 'رفع السمانة واقفاً (جهاز)',

  // --- Core ---
  'Bicycle Crunch': 'كرنش الدراجة',
  Crunch: 'كرنش',
  'Crunch (Machine)': 'كرنش (جهاز)',
  'Crunch (Weighted)': 'كرنش (بأوزان)',
  'Decline Crunch (Weighted)': 'كرنش منخفض (بأوزان)',
  'Hanging Knee Raise': 'رفع الركبة معلقاً',
  'Knee Raise Parallel Bars': 'رفع الركبة على القضبان المتوازية',
  Plank: 'بلانك',
  'Side Bend': 'انحناء جانبي',
  'Side Bend (Dumbbell)': 'انحناء جانبي (دمبل)',
  'Sit Up (Weighted)': 'جلسة (بأوزان)',

  // --- Cardio ---
  'Air Bike': 'الدراجة الهوائية',
  'Elliptical Trainer': 'الجهاز البيضاوي',
  'Stair Machine (Floors)': 'جهاز الدرج (طوابق)',
  'Stair Machine (Steps)': 'جهاز الدرج (درجات)',
  Treadmill: 'جهاز المشي',
  'Warm Up': 'إحماء',

  // --- Deadlift ---
  'Deadlift (Barbell)': 'الرفعة الميتة (بار)',
  'Deadlift (Dumbbell)': 'الرفعة الميتة (دمبل)',
}

// ---------------------------------------------------------------------------
// Fallback: build an Arabic name from muscle group + equipment for any seeded
// exercise that somehow escaped the dictionary. The result is not elegant but
// it is never blank.
// ---------------------------------------------------------------------------

export function draftArabicName(
  nameEn: string,
  muscleGroup: string,
  equipment: string,
): string {
  return (
    ARABIC_NAMES[nameEn] ??
    `${ARABIC_MUSCLE_GROUPS[muscleGroup] ?? muscleGroup} ${ARABIC_EQUIPMENT[equipment] ?? equipment}`
  )
}
