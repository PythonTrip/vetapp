-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Pet" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "species" TEXT NOT NULL,
    "breed" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3) NOT NULL,
    "sex" TEXT NOT NULL,
    "neutered" BOOLEAN NOT NULL DEFAULT false,
    "ownerName" TEXT NOT NULL,
    "ownerContact" TEXT NOT NULL,
    "ownerEmail" TEXT,
    "ownerPhone" TEXT,
    "currentWeight" DOUBLE PRECISION NOT NULL,
    "targetWeight" DOUBLE PRECISION,
    "bcs" INTEGER NOT NULL,
    "lifeStage" TEXT NOT NULL,
    "activityLevel" TEXT NOT NULL,
    "allergies" TEXT NOT NULL DEFAULT '[]',
    "chronicConditions" TEXT NOT NULL DEFAULT '[]',
    "feeding" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consultation" (
    "id" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "chiefComplaint" TEXT,
    "notes" TEXT NOT NULL,
    "transcript" TEXT,
    "vasScore" INTEGER,
    "weight" DOUBLE PRECISION,
    "dietPlanId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "specialty" TEXT,
    "anamnesis" TEXT,
    "anamnesisData" TEXT,
    "physicalExam" TEXT,
    "diagnoses" TEXT NOT NULL DEFAULT '[]',
    "prescriptions" TEXT NOT NULL DEFAULT '[]',
    "followUpPlan" TEXT,
    "followUpDate" TIMESTAMP(3),
    "templateKey" TEXT,
    "templateName" TEXT,
    "templateVersion" INTEGER,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Consultation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LesionPhoto" (
    "id" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "consultationId" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "imageData" TEXT NOT NULL,
    "caption" TEXT,
    "vasScore" INTEGER,
    "bodyRegion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LesionPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DietPlan" (
    "id" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "rer" DOUBLE PRECISION NOT NULL,
    "mer" DOUBLE PRECISION NOT NULL,
    "macros" TEXT NOT NULL,
    "template" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DietPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 30,
    "type" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT NOT NULL DEFAULT 'Stethoscope',
    "type" TEXT NOT NULL,
    "chiefComplaint" TEXT,
    "notes" TEXT NOT NULL,
    "suggestedVas" INTEGER,
    "duration" TEXT,
    "templateKey" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isLatest" BOOLEAN NOT NULL DEFAULT true,
    "sections" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunicationLog" (
    "id" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "duration" INTEGER,
    "subject" TEXT,
    "notes" TEXT,
    "followUp" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunicationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomHandout" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "prompt" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "icon" TEXT NOT NULL DEFAULT 'FileText',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomHandout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "label" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "viewedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionProduct" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "searchName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NutritionProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionProductNutrient" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "calculated" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "NutritionProductNutrient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShareToken_token_key" ON "ShareToken"("token");

-- CreateIndex
CREATE INDEX "NutritionProduct_category_name_idx" ON "NutritionProduct"("category", "name");

-- CreateIndex
CREATE INDEX "NutritionProduct_category_subcategory_name_idx" ON "NutritionProduct"("category", "subcategory", "name");

-- CreateIndex
CREATE INDEX "NutritionProduct_category_searchName_idx" ON "NutritionProduct"("category", "searchName");

-- CreateIndex
CREATE UNIQUE INDEX "NutritionProduct_name_category_key" ON "NutritionProduct"("name", "category");

-- CreateIndex
CREATE INDEX "NutritionProductNutrient_code_idx" ON "NutritionProductNutrient"("code");

-- CreateIndex
CREATE UNIQUE INDEX "NutritionProductNutrient_productId_code_key" ON "NutritionProductNutrient"("productId", "code");

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_dietPlanId_fkey" FOREIGN KEY ("dietPlanId") REFERENCES "DietPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LesionPhoto" ADD CONSTRAINT "LesionPhoto_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LesionPhoto" ADD CONSTRAINT "LesionPhoto_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DietPlan" ADD CONSTRAINT "DietPlan_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationLog" ADD CONSTRAINT "CommunicationLog_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareToken" ADD CONSTRAINT "ShareToken_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionProductNutrient" ADD CONSTRAINT "NutritionProductNutrient_productId_fkey" FOREIGN KEY ("productId") REFERENCES "NutritionProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

