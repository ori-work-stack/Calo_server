import { AnalysisStatus } from "@prisma/client";

export function mapMealDataToPrismaFields(
  mealData: any,
  user_id: string,
  imageBase64?: string,
  mealType?: string,
  mealPeriod?: string
) {
  // Defensive parsing helpers
  const parseNumber = (value: any) =>
    value === undefined || value === null || value === ""
      ? undefined
      : Number(value);

  // Nutrients could come as "calories" or "totalCalories" or "totalCalories" string
  const calories = parseNumber(
    mealData.calories ?? mealData.totalCalories ?? 0
  );
  const protein = parseNumber(
    mealData.protein_g ?? mealData.totalProtein ?? mealData.protein ?? 0
  );
  const carbs = parseNumber(
    mealData.carbs_g ?? mealData.totalCarbs ?? mealData.carbs ?? 0
  );
  const fat = parseNumber(
    mealData.fats_g ?? mealData.totalFat ?? mealData.fat ?? 0
  );
  const fiber = parseNumber(
    mealData.fiber_g ?? mealData.totalFiber ?? mealData.fiber ?? 0
  );
  const sugar = parseNumber(
    mealData.sugar_g ?? mealData.totalSugar ?? mealData.sugar ?? 0
  );

  // These fields might be nested or in JSON objects, normalize them carefully:
  const saturated_fats_g = parseNumber(
    mealData.saturated_fats_g ?? mealData.saturatedFatsG
  );
  const polyunsaturated_fats_g = parseNumber(
    mealData.polyunsaturated_fats_g ?? mealData.polyunsaturatedFatsG
  );
  const monounsaturated_fats_g = parseNumber(
    mealData.monounsaturated_fats_g ?? mealData.monounsaturatedFatsG
  );
  const omega_3_g = parseNumber(
    mealData.omega_3_g ?? mealData.omega3_g ?? mealData.omega_3
  );
  const omega_6_g = parseNumber(
    mealData.omega_6_g ?? mealData.omega6_g ?? mealData.omega_6
  );
  const soluble_fiber_g = parseNumber(
    mealData.soluble_fiber_g ?? mealData.solubleFiberG
  );
  const insoluble_fiber_g = parseNumber(
    mealData.insoluble_fiber_g ?? mealData.insolubleFiberG
  );
  const cholesterol_mg = parseNumber(
    mealData.cholesterol_mg ?? mealData.cholesterolMg
  );
  const sodium_mg = parseNumber(mealData.sodium_mg ?? mealData.sodiumMg);
  const alcohol_g = parseNumber(mealData.alcohol_g ?? mealData.alcoholG);
  const caffeine_mg = parseNumber(mealData.caffeine_mg ?? mealData.caffeineMg);
  const liquids_ml = parseNumber(mealData.liquids_ml ?? mealData.liquidsMl);
  const serving_size_g = parseNumber(
    mealData.serving_size_g ?? mealData.servingSizeG ?? mealData.servingSize_g
  );

  // JSON fields might come as nested objects or JSON strings, parse if needed
  function parseJSONField(field: any) {
    if (!field) return null;
    if (typeof field === "string") {
      try {
        return JSON.parse(field);
      } catch {
        return null;
      }
    }
    return field;
  }

  const vitamins_json =
    mealData.vitamins_json ??
    mealData.vitamins ??
    parseJSONField(mealData.vitamins_json);
  const micronutrients_json =
    mealData.micronutrients_json ??
    mealData.micronutrients ??
    parseJSONField(mealData.micronutrients_json);
  const allergens_json =
    mealData.allergens_json ??
    mealData.allergens ??
    parseJSONField(mealData.allergens_json);
  const additives_json =
    mealData.additives_json ??
    mealData.additives ??
    parseJSONField(mealData.additives_json);

  // Extract ingredients, defaulting to an empty array if not present or not an array
  const ingredients = Array.isArray(mealData.ingredients)
    ? mealData.ingredients
    : typeof mealData.ingredients === "string"
    ? [mealData.ingredients]
    : [];

  return {
    user_id,
    image_url: imageBase64 ? `data:image/jpeg;base64,${imageBase64}` : "",
    upload_time: new Date(),
    analysis_status: "COMPLETED" as const,
    meal_name: mealData.meal_name ?? mealData.name ?? "Unknown meal",
    meal_period: mealPeriod || "other",

    // Macronutrients
    calories,
    protein_g: protein,
    carbs_g: carbs,
    fats_g: fat,
    fiber_g: fiber,
    sugar_g: sugar,

    // Detailed nutrients
    saturated_fats_g,
    polyunsaturated_fats_g,
    monounsaturated_fats_g,
    omega_3_g,
    omega_6_g,
    soluble_fiber_g,
    insoluble_fiber_g,
    cholesterol_mg,
    sodium_mg,
    alcohol_g,
    caffeine_mg,
    liquids_ml,
    serving_size_g,

    // Other details
    glycemic_index: parseNumber(
      mealData.glycemic_index ?? mealData.glycemicIndex
    ),
    insulin_index: parseNumber(mealData.insulin_index ?? mealData.insulinIndex),
    food_category: mealData.food_category ?? mealData.foodCategory ?? null,
    processing_level:
      mealData.processing_level ?? mealData.processingLevel ?? null,
    cooking_method: mealData.cooking_method ?? mealData.cookingMethod ?? null,
    health_risk_notes:
      mealData.health_risk_notes ?? mealData.healthNotes ?? null,
    ingredients: ingredients, // Save the extracted ingredients

    // JSON fields
    vitamins_json,
    micronutrients_json,
    allergens_json,
    additives_json,
  };
}

// utils/nutrition.ts
export function mapExistingMealToPrismaInput(
  originalMeal: any,
  user_id: string,
  date: Date
) {
  return {
    user_id,
    image_url: originalMeal.image_url || "",
    upload_time: date,
    analysis_status: "COMPLETED" as const,
    meal_name: `${originalMeal.meal_name} (Copy)`,
    meal_period: originalMeal.meal_period || "other",
    calories: originalMeal.calories,
    protein_g: originalMeal.protein_g,
    carbs_g: originalMeal.carbs_g,
    fats_g: originalMeal.fats_g,
    fiber_g: originalMeal.fiber_g,
    sugar_g: originalMeal.sugar_g,
    sodium_mg: originalMeal.sodium_mg,
    saturated_fats_g: originalMeal.saturated_fats_g,
    polyunsaturated_fats_g: originalMeal.polyunsaturated_fats_g,
    monounsaturated_fats_g: originalMeal.monounsaturated_fats_g,
    omega_3_g: originalMeal.omega_3_g,
    omega_6_g: originalMeal.omega_6_g,
    soluble_fiber_g: originalMeal.soluble_fiber_g,
    insoluble_fiber_g: originalMeal.insoluble_fiber_g,
    cholesterol_mg: originalMeal.cholesterol_mg,
    alcohol_g: originalMeal.alcohol_g,
    caffeine_mg: originalMeal.caffeine_mg,
    liquids_ml: originalMeal.liquids_ml,
    serving_size_g: originalMeal.serving_size_g,
    allergens_json: originalMeal.allergens_json,
    vitamins_json: originalMeal.vitamins_json,
    micronutrients_json: originalMeal.micronutrients_json,
    glycemic_index: originalMeal.glycemic_index,
    insulin_index: originalMeal.insulin_index,
    food_category: originalMeal.food_category,
    processing_level: originalMeal.processing_level,
    cooking_method: originalMeal.cooking_method,
    health_risk_notes: originalMeal.health_risk_notes,
    ingredients: originalMeal.ingredients,
    created_at: date,
    additives_json: {
      duplicatedFrom: originalMeal.meal_id,
      duplicatedAt: new Date().toISOString(),
    },
  };
}

export function asJsonObject(value: unknown): Record<string, any> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, any>;
  }
  return {};
}
