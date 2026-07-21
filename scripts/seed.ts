// Seed script for VetDietDerm demo data
import { db } from "../src/lib/db";

async function seed() {
  // Clear existing
  await db.appointment.deleteMany();
  await db.lesionPhoto.deleteMany();
  await db.consultation.deleteMany();
  await db.dietPlan.deleteMany();
  await db.pet.deleteMany();

  const now = new Date();
  const monthsAgo = (m: number) => new Date(now.getFullYear(), now.getMonth() - m, 15);
  const daysFromNow = (d: number) => {
    const dt = new Date(now);
    dt.setDate(dt.getDate() + d);
    dt.setHours(10, 0, 0, 0);
    return dt;
  };

  // --- Pet 1: Dog with atopic dermatitis + food allergy trial ---
  const pet1 = await db.pet.create({
    data: {
      name: "Mochi",
      species: "dog",
      breed: "French Bulldog",
      birthDate: new Date(now.getFullYear() - 4, 2, 10),
      sex: "female",
      neutered: true,
      ownerName: "Sarah Chen",
      ownerContact: "sarah.chen@email.com · +1 555 0142",
      currentWeight: 11.2,
      targetWeight: 10.5,
      bcs: 6,
      lifeStage: "adult",
      activityLevel: "moderate",
      notes: "Chronic atopic dermatitis with suspected food allergy component. Seasonal flares in spring.",
    },
  });

  await db.consultation.create({
    data: {
      petId: pet1.id,
      date: monthsAgo(4),
      type: "appointment",
      chiefComplaint: "Recurrent paw licking and ear inflammation",
      notes:
        "Owner reports 6-week history of paw chewing, worse after walks on grass. Bilateral ear discharge. Previous response to short courses of prednisolone but symptoms recur within 2 weeks of stopping.",
      vasScore: 7,
      weight: 11.8,
    },
  });

  await db.consultation.create({
    data: {
      petId: pet1.id,
      date: monthsAgo(4),
      type: "diagnostic",
      chiefComplaint: "Diagnostic workup",
      notes:
        "Skin scrape negative for demodex. Cytology: Malassezia overgrowth on paws and ears. Ear swab: rod bacteria. Allergy testing pending — starting with elimination diet trial.",
      vasScore: 7,
      weight: 11.8,
    },
  });

  await db.consultation.create({
    data: {
      petId: pet1.id,
      date: monthsAgo(3),
      type: "treatment",
      chiefComplaint: "Diet trial initiation",
      notes:
        "Started on hydrolyzed soy diet (Hill's z/d). Tapered prednisolone over 3 weeks. Topical miconazole/chlorhexidine wipes for paws BID. Ear cleaner with Tris-EDTA daily.",
      vasScore: 6,
      weight: 11.5,
    },
  });

  await db.consultation.create({
    data: {
      petId: pet1.id,
      date: monthsAgo(2),
      type: "appointment",
      chiefComplaint: "4-week recheck",
      notes:
        "Significant improvement. Paw licking reduced ~60%. Ears clear on otoscopy. Owner compliant with strict elimination. VAS down from 7 to 4.",
      vasScore: 4,
      weight: 11.3,
    },
  });

  await db.consultation.create({
    data: {
      petId: pet1.id,
      date: monthsAgo(0),
      type: "appointment",
      chiefComplaint: "8-week recheck & rechallenge plan",
      notes:
        "Excellent response — VAS now 2/10. Paw erythema resolved. Plan: rechallenge with original chicken-based diet next week to confirm food allergy. If relapse within 14 days, will continue hydrolyzed diet long-term.",
      vasScore: 2,
      weight: 11.2,
    },
  });

  const diet1 = await db.dietPlan.create({
    data: {
      petId: pet1.id,
      name: "Elimination: Hydrolyzed Soy",
      type: "commercial",
      rer: 70 * Math.pow(11.2, 0.75),
      mer: Math.round(70 * Math.pow(11.2, 0.75) * 1.6),
      macros: JSON.stringify({ protein: 56, fat: 28, carbs: 16 }),
      template: null,
      notes: "Hill's z/d Ultimate Allergen Free. Feed 100% of daily intake. No other foods, treats, or flavored medications.",
    },
  });

  const svgPhoto = (label: string, color: string) =>
    `data:image/svg+xml;base64,${Buffer.from(
      `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300'><rect width='400' height='300' fill='${color}'/><circle cx='200' cy='150' r='80' fill='#dc2626' opacity='0.6'/><circle cx='150' cy='120' r='25' fill='#7c2d12'/><circle cx='250' cy='170' r='30' fill='#7c2d12'/><text x='200' y='280' font-family='sans-serif' font-size='16' fill='white' text-anchor='middle'>${label}</text></svg>`
    ).toString("base64")}`;

  await db.lesionPhoto.create({
    data: {
      petId: pet1.id,
      date: monthsAgo(4),
      imageData: svgPhoto("Paw — Before (4 mo ago)", "#fde68a"),
      caption: "Erythema and alopecia on interdigital skin, all four paws.",
      vasScore: 7,
      bodyRegion: "Paw pads / interdigital",
    },
  });
  await db.lesionPhoto.create({
    data: {
      petId: pet1.id,
      date: monthsAgo(2),
      imageData: svgPhoto("Paw — 6 weeks into trial", "#fef3c7"),
      caption: "Marked reduction in erythema. Hair regrowth beginning.",
      vasScore: 4,
      bodyRegion: "Paw pads / interdigital",
    },
  });
  await db.lesionPhoto.create({
    data: {
      petId: pet1.id,
      date: monthsAgo(0),
      imageData: svgPhoto("Paw — 12 weeks (now)", "#fefce8"),
      caption: "Near-complete resolution. Mild residual hyperpigmentation.",
      vasScore: 2,
      bodyRegion: "Paw pads / interdigital",
    },
  });

  // --- Pet 2: Cat with obesity ---
  const pet2 = await db.pet.create({
    data: {
      name: "Luna",
      species: "cat",
      breed: "Domestic Shorthair",
      birthDate: new Date(now.getFullYear() - 8, 5, 20),
      sex: "female",
      neutered: true,
      ownerName: "Marcus Rivera",
      ownerContact: "marcus.r@email.com · +1 555 0188",
      currentWeight: 6.8,
      targetWeight: 5.0,
      bcs: 8,
      lifeStage: "senior",
      activityLevel: "low",
      notes: "Obese indoor cat. Mild recurrent overgrooming on ventrum — possible stress vs early food sensitivity.",
    },
  });

  await db.consultation.create({
    data: {
      petId: pet2.id,
      date: monthsAgo(2),
      type: "appointment",
      chiefComplaint: "Weight gain and overgrooming",
      notes:
        "8-year-old DSH, 6.8 kg (BCS 8/9). Owner free-feeds dry food. Overgrooming ventrum and base of tail. No fleas on combing. Recommend measured feeding, weight loss diet, and environmental enrichment.",
      vasScore: 5,
      weight: 6.8,
    },
  });

  await db.dietPlan.create({
    data: {
      petId: pet2.id,
      name: "Weight Management Plan",
      type: "commercial",
      rer: 70 * Math.pow(5.0, 0.75),
      mer: Math.round(70 * Math.pow(5.0, 0.75) * 0.8),
      macros: JSON.stringify({ protein: 45, fat: 12, carbs: 30 }),
      notes: "Royal Canin Satiety. Feed 80% of RER for ideal weight (5.0 kg) = 175 kcal/day. Recheck every 2 weeks.",
    },
  });

  // --- Pet 3: Dog puppy nutrition consult ---
  const pet3 = await db.pet.create({
    data: {
      name: "Biscuit",
      species: "dog",
      breed: "Golden Retriever",
      birthDate: new Date(now.getFullYear() - 1, 0, 5),
      sex: "male",
      neutered: true,
      ownerName: "Emily Park",
      ownerContact: "emily.park@email.com · +1 555 0177",
      currentWeight: 28.5,
      targetWeight: 30.0,
      bcs: 4,
      lifeStage: "puppy_kitten",
      activityLevel: "high",
      notes: "Healthy 1-year-old. Owner interested in home-cooked diet for long-term joint and coat health.",
    },
  });

  await db.consultation.create({
    data: {
      petId: pet3.id,
      date: monthsAgo(1),
      type: "appointment",
      chiefComplaint: "Nutrition consultation",
      notes:
        "Healthy Golden Retriever approaching adult weight. Owner wants balanced home-cooked diet. Discussed BARF and cooked options, calcium/phosphorus balance, and supplement needs (omega-3, taurine for large breeds).",
      vasScore: 1,
      weight: 28.5,
    },
  });

  await db.dietPlan.create({
    data: {
      petId: pet3.id,
      name: "Home-Cooked Adult Maintenance",
      type: "home_cooked",
      rer: 70 * Math.pow(28.5, 0.75),
      mer: Math.round(70 * Math.pow(28.5, 0.75) * 1.8),
      macros: JSON.stringify({ protein: 25, fat: 15, carbs: 60 }),
      template: JSON.stringify([
        { category: "protein", ingredient: "Chicken thigh (cooked)", percentage: 40 },
        { category: "organ", ingredient: "Beef liver", percentage: 5 },
        { category: "vegetable", ingredient: "Sweet potato", percentage: 20 },
        { category: "vegetable", ingredient: "Spinach / green beans", percentage: 15 },
        { category: "grain", ingredient: "Brown rice", percentage: 15 },
        { category: "supplement", ingredient: "Calcium carbonate + fish oil", percentage: 5 },
      ]),
      notes: "Balanced adult maintenance recipe. Add 1g calcium carbonate per 100g meat. Omega-3: 1 fish oil capsule (1000mg EPA+DHA) daily.",
    },
  });

  // --- Appointments (upcoming) ---
  await db.appointment.create({
    data: {
      petId: pet1.id,
      date: daysFromNow(2),
      duration: 45,
      type: "recheck",
      reason: "Post-elimination-diet rechallenge follow-up",
      status: "scheduled",
      notes: "Confirm food allergy diagnosis. Assess VAS after 14-day chicken rechallenge.",
    },
  });
  await db.appointment.create({
    data: {
      petId: pet1.id,
      date: daysFromNow(9),
      duration: 30,
      type: "telemedicine",
      reason: "Telemedicine check-in — itching control",
      status: "scheduled",
      notes: "Quick video call to assess pruritus control on long-term diet.",
    },
  });
  await db.appointment.create({
    data: {
      petId: pet2.id,
      date: daysFromNow(4),
      duration: 30,
      type: "recheck",
      reason: "Weight-loss progress check (2-week)",
      status: "scheduled",
      notes: "Weigh-in, assess BCS, adjust MER if losing <1%/week.",
    },
  });
  await db.appointment.create({
    data: {
      petId: pet3.id,
      date: daysFromNow(7),
      duration: 60,
      type: "consultation",
      reason: "Home-cooked diet recipe review & balancing",
      status: "scheduled",
      notes: "Review 2-week trial of home-cooked recipe. Adjust calcium:phosphorus ratio.",
    },
  });
  await db.appointment.create({
    data: {
      petId: pet2.id,
      date: daysFromNow(14),
      duration: 45,
      type: "procedure",
      reason: "Bloodwork — senior wellness panel",
      status: "scheduled",
      notes: "Pre-anesthetic bloodwork + T4 check given age and obesity.",
    },
  });

  console.log("✅ Seed complete.");
  console.log("   Pets: 3 | Consultations: 7 | Lesion Photos: 3 | Diet Plans: 3 | Appointments: 5");
}

seed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
