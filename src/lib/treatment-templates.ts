// Treatment Plan Templates — reusable clinical protocols for VetDietDerm
// Each template pre-fills type, chief complaint, full SOAP-style notes, and suggested VAS

import type { ConsultationType } from "@/lib/types";

export interface TreatmentTemplate {
  id: string;
  name: string;
  category: "dermatology" | "nutrition" | "wellness" | "emergency";
  description: string;
  icon: string; // lucide icon name
  type: ConsultationType;
  chiefComplaint: string;
  notes: string;
  suggestedVas?: number;
  duration?: string;
  version?: number;
  templateKey?: string;
  sections?: string;
}

export const TREATMENT_TEMPLATES: TreatmentTemplate[] = [
  // --- Dermatology ---
  {
    id: "atopic-flare",
    name: "Atopic Dermatitis Flare",
    category: "dermatology",
    description: "Acute flare of atopic dermatitis with secondary infection",
    icon: "Flame",
    type: "treatment",
    chiefComplaint: "Acute atopic dermatitis flare",
    notes:
      "S: Increased pruritus over 5-7 days. Owner reports paw chewing, face rubbing, and axillary erythema. Previous flare pattern similar.\n" +
      "O: Diffuse erythema on ventrum and paws. Alopecia on interdigital skin. Mild otitis externa bilateral. Cytology: Malassezia overgrowth.\n" +
      "A: Atopic dermatitis flare with secondary Malassezia dermatitis.\n" +
      "P: Prednisolone 0.5 mg/kg PO q24h × 7 days then taper. Miconazole/chlorhexidine wipes to paws BID. Ear cleaner + topical otic BID. Recheck in 2 weeks.",
    suggestedVas: 7,
    sections: JSON.stringify({
      anamnesisAnswers: {
        duration: "1–4 недели",
        course: "Рецидивирующее",
        lesionSites: ["Лапы", "Морда", "Подмышки"],
        pruritusBehavior: ["Грызёт лапы", "Трётся мордой", "Чешется"],
        pastTreatment: "Предыдущие обострения по схожей схеме; ответ на терапию был",
      },
      physicalExam: "Диффузная эритема на животе и лапах. Алопеция межпальцевых пространств. Двусторонний лёгкий наружный отит. Цитология: избыточный рост Malassezia.",
      diagnoses: ["Обострение атопического дерматита", "Вторичный Malassezia-дерматит"],
      prescriptions: [
        { name: "Преднизолон", dosage: "0.5 мг/кг", frequency: "1 р/д внутрь", duration: "7 дней, затем снижение", instructions: "" },
        { name: "Салфетки миконазол/хлоргексидин на лапы", dosage: "", frequency: "2 р/д", duration: "14 дней", instructions: "" },
        { name: "Лосьон для ушей + местный отик", dosage: "", frequency: "2 р/д", duration: "10 дней", instructions: "" },
      ],
      followUpPlan: "Повторный осмотр через 2 недели, контроль VAS.",
    }),
  },
  {
    id: "otitis-externa",
    name: "Otitis Externa Treatment",
    category: "dermatology",
    description: "Acute otitis externa with cytology-guided therapy",
    icon: "Ear",
    type: "treatment",
    chiefComplaint: "Head shaking and ear scratching",
    notes:
      "S: Owner reports 1-week history of head shaking, ear scratching, and malodor from affected ear.\n" +
      "O: Erythematous ear canal with moderate waxy exudate. Otoscopy: intact TM, stenosis noted. Cytology: cocci (Staph) + yeast.\n" +
      "A: Bacterial-yeast otitis externa.\n" +
      "P: Tris-EDTA ear cleaner daily × 7 days. Topical otic (enrofloxacin + silver sulfadiazine + betamethasone) BID × 10 days. Recheck cytology in 14 days.",
    suggestedVas: 6,
    sections: JSON.stringify({
      anamnesisAnswers: {
        duration: "1–4 недели",
        course: "Впервые",
        lesionSites: ["Слуховые проходы", "Уши (ушная раковина)"],
        pruritusBehavior: ["Трясёт головой", "Чешется"],
      },
      physicalExam: "Эритематозный слуховой канал с умеренным восковидным экссудатом. Отоскопия: барабанная перепонка интактна, отмечается стеноз. Цитология: кокки (Staphylococcus) + дрожжи.",
      diagnoses: ["Бактериально-дрожжевой наружный отит"],
      prescriptions: [
        { name: "Очиститель ушей Tris-EDTA", dosage: "", frequency: "1 р/д", duration: "7 дней", instructions: "" },
        { name: "Местный отик (энрофлоксацин + сульфадиазин серебра + бетаметазон)", dosage: "", frequency: "2 р/д", duration: "10 дней", instructions: "" },
      ],
      followUpPlan: "Контрольная цитология через 14 дней.",
    }),
  },
  {
    id: "food-allergy-elimination",
    name: "Food Allergy Elimination Trial",
    category: "dermatology",
    description: "Start 8-12 week elimination diet trial",
    icon: "Utensils",
    type: "treatment",
    chiefComplaint: "Chronic pruritus — initiate elimination diet",
    notes:
      "S: Year-round non-seasonal pruritus affecting paws, ears, and ventrum. Previous steroid response but symptoms recur.\n" +
      "O: Erythema and self-trauma on paws and ventrum. BCS within normal limits. No evidence of ectoparasites on skin scrape.\n" +
      "A: Suspected cutaneous adverse food reaction.\n" +
      "P: Start hydrolyzed protein diet (Hill's z/d or Royal Canin Anallergenic) exclusively for 8-12 weeks. No treats, flavored meds, or table food. Taper anti-itch medications over 2 weeks. Weekly VAS scoring. Recheck at 4, 8, and 12 weeks.",
    suggestedVas: 6,
    sections: JSON.stringify({
      anamnesisAnswers: {
        duration: "Больше года",
        course: "Постоянное",
        seasonality: "Круглогодично",
        lesionSites: ["Лапы", "Слуховые проходы", "Живот"],
        pastTreatment: "Ответ на стероиды с рецидивом после отмены",
      },
      physicalExam: "Эритема и самотравматизация кожи лап и живота. BCS в пределах нормы. Эктопаразиты не обнаружены (соскоб отрицательный).",
      diagnoses: ["Подозрение на нежелательную пищевую реакцию"],
      prescriptions: [
        { name: "Гидролизованная диета (Hill's z/d или RC Anallergenic)", dosage: "", frequency: "Исключительно, без лакомств", duration: "8–12 недель", instructions: "" },
      ],
      followUpPlan: "Еженедельная оценка VAS; контроль на 4, 8 и 12 неделе. Исключить лакомства, еду со стола и ароматизированные препараты.",
    }),
  },
  {
    id: "pyoderma",
    name: "Superficial Pyoderma",
    category: "dermatology",
    description: "Bacterial folliculitis treatment with culture-guided antibiotics",
    icon: "ShieldAlert",
    type: "treatment",
    chiefComplaint: "Papules, pustules, and epidermal collarettes",
    notes:
      "S: Owner reports multiple skin lesions progressing over 2 weeks. Pruritus moderate. No prior antibiotic therapy in 6 months.\n" +
      "O: Papulopustular eruptions on ventrum and medial thighs. Epidermal collarettes present. Regional lymphadenopathy mild.\n" +
      "A: Superficial bacterial folliculitis (likely Staphylococcus pseudintermedius).\n" +
      "P: Cefpodoxime 5-10 mg/kg PO q24h × 21 days (pending culture). Chlorhexidine 4% shampoo twice weekly. Culture submitted. Recheck at 14 and 28 days — continue antibiotics 7 days past clinical resolution.",
    suggestedVas: 5,
    sections: JSON.stringify({
      anamnesisAnswers: {
        duration: "1–4 недели",
        course: "Впервые",
        lesionSites: ["Живот", "Пах"],
        pastTreatment: "Антибиотики в последние 6 месяцев не применялись",
      },
      physicalExam: "Папулопустулёзные высыпания на животе и внутренней поверхности бёдер. Эпидермальные воротнички. Лёгкая регионарная лимфаденопатия.",
      diagnoses: ["Поверхностная бактериальная пиодермия (фолликулит)"],
      prescriptions: [
        { name: "Цефподоксим", dosage: "5–10 мг/кг", frequency: "1 р/д внутрь", duration: "21 день", instructions: "" },
        { name: "Шампунь с хлоргексидином 4%", dosage: "", frequency: "2 р/нед", duration: "До разрешения", instructions: "" },
      ],
      followUpPlan: "Осмотр на 14 и 28 день; антибиотик продолжать ещё 7 дней после клинического разрешения. Посев отправлен.",
    }),
  },

  // --- Nutrition ---
  {
    id: "weight-loss-start",
    name: "Weight Loss Program Initiation",
    category: "nutrition",
    description: "Begin structured weight management plan",
    icon: "TrendingDown",
    type: "treatment",
    chiefComplaint: "Obesity — initiate weight loss program",
    notes:
      "S: Owner reports weight gain despite 'normal' food intake. Pet is less active. No polyuria/polydipsia.\n" +
      "O: BCS 7-8/9. Weight above breed ideal. Muscle condition adequate. No signs of endocrine disease on exam.\n" +
      "A: Obesity (primary nutritional).\n" +
      "P: Calculate MER at target weight × 0.8 for weight loss. Transition to weight management diet over 7 days. Measured feedings, no free-feeding. Increase activity: 15-min walks twice daily. Recheck weight every 2 weeks. Target loss: 1-2% BW/week.",
    sections: JSON.stringify({
      anamnesisAnswers: {
        goal: "Снижение веса",
        appetite: "Повышен",
        weightDynamics: "Набирает",
        foodAccess: ["Свободный доступ к корму"],
      },
      physicalExam: "BCS 7–8/9, вес выше идеального для породы. Мышечная масса адекватна. Признаков эндокринопатии при осмотре нет.",
      diagnoses: ["Ожирение (алиментарное)"],
      prescriptions: [
        { name: "Диета для снижения веса", dosage: "MER целевого веса × 0.8", frequency: "Дозированные кормления, без свободного доступа", duration: "Переход за 7 дней", instructions: "" },
        { name: "Прогулки", dosage: "15 минут", frequency: "2 р/д", duration: "Постоянно", instructions: "" },
      ],
      followUpPlan: "Взвешивание каждые 2 недели. Цель — потеря 1–2% массы тела в неделю.",
    }),
  },
  {
    id: "diet-transition",
    name: "Diet Transition Protocol",
    category: "nutrition",
    description: "Safe 7-day transition to new diet to avoid GI upset",
    icon: "ArrowRightLeft",
    type: "appointment",
    chiefComplaint: "Diet change consultation",
    notes:
      "S: Owner requests guidance on switching to new diet. Previous abrupt changes caused diarrhea.\n" +
      "O: Healthy on exam. BCS ideal. No GI signs currently.\n" +
      "A: Healthy patient — diet transition indicated.\n" +
      "P: 7-day transition schedule: Days 1-2: 25% new/75% old. Days 3-4: 50/50. Days 5-6: 75% new/25% old. Day 7: 100% new. If soft stool develops, slow transition. Monitor appetite and stool quality. Recheck in 2 weeks.",
    sections: JSON.stringify({
      anamnesisAnswers: {
        goal: "Подбор рациона",
        appetite: "Обычный",
        stool: "Норма",
        dietHistory: "Резкие смены корма ранее вызывали диарею",
      },
      physicalExam: "Клинически здоров. BCS в норме. ЖКТ-симптомов на момент осмотра нет.",
      diagnoses: ["Плановая смена рациона"],
      prescriptions: [
        { name: "Схема перехода на новый корм", dosage: "Дни 1–2: 25%, дни 3–4: 50%, дни 5–6: 75%, день 7: 100% нового", frequency: "По дням", duration: "7 дней", instructions: "" },
      ],
      followUpPlan: "Контроль аппетита и качества стула; при размягчении стула замедлить переход. Осмотр через 2 недели.",
    }),
  },
  {
    id: "barf-diet-setup",
    name: "BARF Diet Setup",
    category: "nutrition",
    description: "Establish balanced raw diet with supplement protocol",
    icon: "Beef",
    type: "appointment",
    chiefComplaint: "Raw diet (BARF) formulation consult",
    notes:
      "S: Owner interested in home-prepared raw diet. Has researched but wants veterinary oversight for balance.\n" +
      "O: Healthy adult, ideal BCS. No GI pathology. Owner understands food safety requirements.\n" +
      "A: Candidate for home-prepared BARF diet with supplementation.\n" +
      "P: Formula: 60% muscle meat, 10% raw meaty bone, 5% liver, 5% other organ, 15% vegetable, 5% supplement. Add: omega-3 (fish oil), vitamin E, taurine (for dogs). Daily kcal = MER. Provided written recipe and supplement list. Food safety briefing given. Recheck in 4 weeks with weight and BCS.",
    sections: JSON.stringify({
      anamnesisAnswers: {
        goal: "Подбор рациона",
        appetite: "Обычный",
        dietHistory: "Владелец хочет перевести на домашний сырой рацион под ветеринарным контролем",
      },
      physicalExam: "Здоровое взрослое животное, идеальный BCS. Патологий ЖКТ нет. Владелец понимает требования пищевой безопасности.",
      diagnoses: ["Кандидат на домашний BARF-рацион с добавками"],
      prescriptions: [
        { name: "BARF-формула", dosage: "60% мышечное мясо, 10% мясные кости, 5% печень, 5% другие органы, 15% овощи, 5% добавки", frequency: "Суточная калорийность = MER", duration: "Постоянно", instructions: "" },
        { name: "Омега-3 (рыбий жир), витамин E, таурин", dosage: "", frequency: "Ежедневно", duration: "Постоянно", instructions: "" },
      ],
      followUpPlan: "Контроль веса и BCS через 4 недели. Выданы письменный рецепт и список добавок, проведён инструктаж по безопасности.",
    }),
  },

  // --- Wellness ---
  {
    id: "senior-wellness",
    name: "Senior Wellness Exam",
    category: "wellness",
    description: "Comprehensive senior health screening",
    icon: "HeartPulse",
    type: "appointment",
    chiefComplaint: "Senior wellness examination",
    notes:
      "S: Owner reports pet 'slowing down' but otherwise well. Appetite normal. No coughing, vomiting, or diarrhea.\n" +
      "O: Alert and responsive. BCS 5/9. Mild dental tartar. Heart sounds normal, no murmur. Abdomen soft, non-painful. Mobility: mild stiffness in hindlimbs.\n" +
      "A: Healthy senior with early osteoarthritis signs.\n" +
      "P: Recommend senior bloodwork panel (CBC, chem, T4, urinalysis). Start joint supplement (glucosamine/chondroitin + omega-3). Dental cleaning recommended. Recheck in 6 months or sooner if concerns.",
    suggestedVas: 1,
  },
  {
    id: "vaccination-visit",
    name: "Vaccination Visit",
    category: "wellness",
    description: "Core vaccination and annual exam",
    icon: "Syringe",
    type: "appointment",
    chiefComplaint: "Annual vaccination",
    notes:
      "S: Due for annual vaccines. Owner reports pet healthy, no concerns.\n" +
      "O: Physical exam unremarkable. BCS ideal. Temp/pulse/resp normal.\n" +
      "A: Healthy — due for core vaccines.\n" +
      "P: Administered core vaccines (DHPP for dogs / FVRCP for cats) + rabies. Recommend leptospirosis and Bordetella based on lifestyle. Dispensed monthly heartworm/flea prevention. Next vaccines in 1 year.",
    suggestedVas: 1,
  },

  // --- Emergency ---
  {
    id: "acute-vomiting",
    name: "Acute Vomiting Workup",
    category: "emergency",
    description: "Diagnostic workup for acute gastrointestinal signs",
    icon: "AlertTriangle",
    type: "diagnostic",
    chiefComplaint: "Acute onset vomiting",
    notes:
      "S: Owner reports 24-hour history of vomiting (4-5 episodes). Initially food, now bilious. Lethargic. No diarrhea. No known dietary indiscretion.\n" +
      "O: 5% dehydrated. Mild abdominal discomfort on palpation. No foreign body palpated. TPR: mild fever (102.8°F).\n" +
      "A: Acute gastritis vs foreign body vs pancreatitis.\n" +
      "P: CBC/chem/lipase. Abdominal radiographs to rule out obstruction. Maropitant 1 mg/kg SC. IV fluids (LRS 2x maintenance). NPO 12h then bland diet. Recheck in 24h.",
    suggestedVas: 3,
  },
];

export const TEMPLATE_CATEGORY_META: Record<TreatmentTemplate["category"], { label: string; color: string; icon: string }> = {
  dermatology: { label: "Dermatology", color: "bg-teal-500/10 text-teal-600 dark:text-teal-400", icon: "Shield" },
  nutrition: { label: "Nutrition", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", icon: "Apple" },
  wellness: { label: "Wellness", color: "bg-violet-500/10 text-violet-600 dark:text-violet-400", icon: "HeartPulse" },
  emergency: { label: "Emergency", color: "bg-red-500/10 text-red-600 dark:text-red-400", icon: "AlertTriangle" },
};
