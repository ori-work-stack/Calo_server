import { prisma } from "../lib/database";
import { UserMealPlanConfig, WeeklyMealPlan, MealPlanTemplate } from "../types/mealPlans";
import { OpenAIService } from "./openai";

export class MealPlanService {
  /**
   * Create a comprehensive user meal plan with AI assistance
   */
  static async createUserMealPlan(
    userId: string,
    config: UserMealPlanConfig
  ): Promise<any> {
    try {
      console.log("🎨 Creating comprehensive meal plan for user:", userId);
      console.log("📋 Configuration:", config);

      // Get user context for personalization
      const [user, questionnaire, nutritionPlan] = await Promise.all([
        prisma.user.findUnique({ where: { user_id: userId } }),
        prisma.userQuestionnaire.findFirst({
          where: { user_id: userId },
          orderBy: { date_completed: 'desc' }
        }),
        prisma.nutritionPlan.findFirst({
          where: { user_id: userId },
          orderBy: { created_at: 'desc' }
        })
      ]);

      if (!user) {
        throw new Error("User not found");
      }

      if (!questionnaire) {
        throw new Error("User questionnaire not found. Please complete the questionnaire first.");
      }

      // Calculate nutrition targets
      const nutritionTargets = this.calculateNutritionTargets(questionnaire, nutritionPlan);

      // Generate meal plan using AI or fallback
      const weeklyPlan = await this.generateWeeklyMealPlan(
        config,
        questionnaire,
        nutritionTargets
      );

      // Create meal plan record
      const mealPlan = await prisma.userMealPlan.create({
        data: {
          user_id: userId,
          name: config.name,
          plan_type: config.plan_type,
          meals_per_day: config.meals_per_day,
          snacks_per_day: config.snacks_per_day,
          rotation_frequency_days: config.rotation_frequency_days,
          include_leftovers: config.include_leftovers,
          fixed_meal_times: config.fixed_meal_times,
          target_calories_daily: nutritionTargets.calories,
          target_protein_daily: nutritionTargets.protein,
          target_carbs_daily: nutritionTargets.carbs,
          target_fats_daily: nutritionTargets.fats,
          dietary_preferences: config.dietary_preferences.join(', '),
          excluded_ingredients: config.excluded_ingredients.join(', '),
          start_date: new Date(),
          end_date: new Date(Date.now() + config.rotation_frequency_days * 24 * 60 * 60 * 1000),
          is_active: false,
          total_meals: this.calculateTotalMeals(config),
          status: 'not_started'
        }
      });

      // Create meal templates and schedules
      await this.createMealTemplatesAndSchedules(mealPlan.plan_id, weeklyPlan);

      // Return complete meal plan with schedules
      const completeMealPlan = await prisma.userMealPlan.findUnique({
        where: { plan_id: mealPlan.plan_id },
        include: {
          schedules: {
            include: {
              template: true
            },
            orderBy: [{ day_of_week: 'asc' }, { meal_timing: 'asc' }]
          }
        }
      });

      console.log("✅ Comprehensive meal plan created successfully");
      return completeMealPlan;

    } catch (error) {
      console.error("💥 Error creating meal plan:", error);
      throw error;
    }
  }

  /**
   * Generate weekly meal plan using AI or intelligent fallback
   */
  private static async generateWeeklyMealPlan(
    config: UserMealPlanConfig,
    questionnaire: any,
    nutritionTargets: any
  ): Promise<WeeklyMealPlan> {
    try {
      if (OpenAIService.isAvailable()) {
        return await this.generateAIMealPlan(config, questionnaire, nutritionTargets);
      } else {
        console.log("⚠️ OpenAI not available, using intelligent fallback");
        return this.generateFallbackMealPlan(config, questionnaire, nutritionTargets);
      }
    } catch (error) {
      console.error("💥 AI meal plan generation failed, using fallback:", error);
      return this.generateFallbackMealPlan(config, questionnaire, nutritionTargets);
    }
  }

  /**
   * Generate AI-powered meal plan
   */
  private static async generateAIMealPlan(
    config: UserMealPlanConfig,
    questionnaire: any,
    nutritionTargets: any
  ): Promise<WeeklyMealPlan> {
    const prompt = this.buildMealPlanPrompt(config, questionnaire, nutritionTargets);
    const aiResponse = await OpenAIService.generateText(prompt, 3000);
    
    try {
      const parsed = JSON.parse(aiResponse);
      return this.convertAIResponseToWeeklyPlan(parsed);
    } catch (parseError) {
      console.error("💥 Failed to parse AI meal plan response:", parseError);
      return this.generateFallbackMealPlan(config, questionnaire, nutritionTargets);
    }
  }

  /**
   * Generate intelligent fallback meal plan
   */
  private static generateFallbackMealPlan(
    config: UserMealPlanConfig,
    questionnaire: any,
    nutritionTargets: any
  ): WeeklyMealPlan {
    console.log("🆘 Generating intelligent fallback meal plan");

    const weeklyPlan: WeeklyMealPlan = {};
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const mealTimings = this.getMealTimingsForConfig(config);

    // Create base meal templates
    const baseMeals = this.createBaseMealTemplates(questionnaire, nutritionTargets);

    dayNames.forEach((day, dayIndex) => {
      weeklyPlan[day] = {};
      
      mealTimings.forEach((timing, mealIndex) => {
        const mealTemplate = this.selectMealForSlot(
          baseMeals,
          timing,
          dayIndex,
          mealIndex,
          questionnaire
        );
        
        weeklyPlan[day][timing] = [mealTemplate];
      });
    });

    return weeklyPlan;
  }

  /**
   * Calculate nutrition targets based on questionnaire and goals
   */
  private static calculateNutritionTargets(questionnaire: any, nutritionPlan: any) {
    if (nutritionPlan) {
      return {
        calories: nutritionPlan.goal_calories || 2000,
        protein: nutritionPlan.goal_protein_g || 150,
        carbs: nutritionPlan.goal_carbs_g || 250,
        fats: nutritionPlan.goal_fats_g || 67
      };
    }

    // Calculate from questionnaire
    const weight = questionnaire.weight_kg || 70;
    const height = questionnaire.height_cm || 170;
    const age = questionnaire.age || 25;
    const isMale = questionnaire.gender?.toLowerCase().includes('male');

    // Calculate BMR
    let bmr;
    if (isMale) {
      bmr = 10 * weight + 6.25 * height - 5 * age + 5;
    } else {
      bmr = 10 * weight + 6.25 * height - 5 * age - 161;
    }

    // Apply activity multiplier
    const activityMultipliers = {
      'NONE': 1.2,
      'LIGHT': 1.375,
      'MODERATE': 1.55,
      'HIGH': 1.725
    };

    const activityLevel = questionnaire.physical_activity_level || 'MODERATE';
    const tdee = bmr * (activityMultipliers[activityLevel] || 1.55);

    // Adjust for goals
    let targetCalories = tdee;
    switch (questionnaire.main_goal) {
      case 'WEIGHT_LOSS':
        targetCalories = tdee - 500;
        break;
      case 'WEIGHT_GAIN':
        targetCalories = tdee + 300;
        break;
      case 'SPORTS_PERFORMANCE':
        targetCalories = tdee + 200;
        break;
    }

    return {
      calories: Math.round(targetCalories),
      protein: Math.round(weight * 1.6),
      carbs: Math.round((targetCalories * 0.45) / 4),
      fats: Math.round((targetCalories * 0.30) / 9)
    };
  }

  /**
   * Create base meal templates for fallback
   */
  private static createBaseMealTemplates(questionnaire: any, nutritionTargets: any): MealPlanTemplate[] {
    const caloriesPerMeal = Math.round(nutritionTargets.calories / 3);
    const proteinPerMeal = Math.round(nutritionTargets.protein / 3);

    const templates: MealPlanTemplate[] = [
      // Breakfast options
      {
        template_id: 'breakfast_1',
        name: 'Protein Scrambled Eggs',
        description: 'Scrambled eggs with vegetables and whole grain toast',
        meal_timing: 'BREAKFAST',
        dietary_category: 'BALANCED',
        prep_time_minutes: 15,
        difficulty_level: 2,
        calories: Math.round(caloriesPerMeal * 0.9),
        protein_g: Math.round(proteinPerMeal * 1.2),
        carbs_g: Math.round(caloriesPerMeal * 0.3 / 4),
        fats_g: Math.round(caloriesPerMeal * 0.25 / 9),
        fiber_g: 5,
        sugar_g: 3,
        sodium_mg: 400,
        ingredients: ['eggs', 'spinach', 'whole grain bread', 'olive oil'],
        instructions: ['Heat pan with olive oil', 'Add spinach and cook until wilted', 'Add beaten eggs and scramble', 'Serve with toasted bread'],
        allergens: ['eggs', 'gluten'],
        image_url: null,
        created_at: new Date(),
        updated_at: new Date(),
        is_active: true
      },
      // Lunch options
      {
        template_id: 'lunch_1',
        name: 'Grilled Chicken Salad',
        description: 'Grilled chicken breast with mixed greens and quinoa',
        meal_timing: 'LUNCH',
        dietary_category: 'HIGH_PROTEIN',
        prep_time_minutes: 25,
        difficulty_level: 2,
        calories: caloriesPerMeal,
        protein_g: proteinPerMeal,
        carbs_g: Math.round(caloriesPerMeal * 0.35 / 4),
        fats_g: Math.round(caloriesPerMeal * 0.25 / 9),
        fiber_g: 8,
        sugar_g: 5,
        sodium_mg: 500,
        ingredients: ['chicken breast', 'mixed greens', 'quinoa', 'olive oil', 'lemon'],
        instructions: ['Grill chicken breast', 'Cook quinoa', 'Mix greens with quinoa', 'Top with sliced chicken', 'Dress with olive oil and lemon'],
        allergens: [],
        image_url: null,
        created_at: new Date(),
        updated_at: new Date(),
        is_active: true
      },
      // Dinner options
      {
        template_id: 'dinner_1',
        name: 'Baked Salmon with Vegetables',
        description: 'Baked salmon fillet with roasted vegetables and sweet potato',
        meal_timing: 'DINNER',
        dietary_category: 'BALANCED',
        prep_time_minutes: 35,
        difficulty_level: 3,
        calories: Math.round(caloriesPerMeal * 1.1),
        protein_g: Math.round(proteinPerMeal * 1.1),
        carbs_g: Math.round(caloriesPerMeal * 0.4 / 4),
        fats_g: Math.round(caloriesPerMeal * 0.3 / 9),
        fiber_g: 6,
        sugar_g: 8,
        sodium_mg: 450,
        ingredients: ['salmon fillet', 'sweet potato', 'broccoli', 'bell peppers', 'olive oil'],
        instructions: ['Preheat oven to 200°C', 'Season salmon with herbs', 'Cut vegetables and toss with oil', 'Bake salmon and vegetables for 25 minutes'],
        allergens: ['fish'],
        image_url: null,
        created_at: new Date(),
        updated_at: new Date(),
        is_active: true
      }
    ];

    // Adjust for dietary preferences
    if (questionnaire.dietary_style?.toLowerCase().includes('vegetarian')) {
      templates.forEach(template => {
        if (template.ingredients.includes('chicken breast')) {
          template.ingredients = template.ingredients.map(ing => 
            ing === 'chicken breast' ? 'tofu' : ing
          );
          template.name = template.name.replace('Chicken', 'Tofu');
        }
        if (template.ingredients.includes('salmon fillet')) {
          template.ingredients = template.ingredients.map(ing => 
            ing === 'salmon fillet' ? 'tempeh' : ing
          );
          template.name = template.name.replace('Salmon', 'Tempeh');
        }
      });
    }

    return templates;
  }

  /**
   * Get meal timings based on configuration
   */
  private static getMealTimingsForConfig(config: UserMealPlanConfig): string[] {
    const timings = ['BREAKFAST', 'LUNCH', 'DINNER'];
    
    if (config.snacks_per_day > 0) {
      timings.push('MORNING_SNACK');
      if (config.snacks_per_day > 1) {
        timings.push('AFTERNOON_SNACK');
      }
    }

    return timings.slice(0, config.meals_per_day + config.snacks_per_day);
  }

  /**
   * Select appropriate meal for specific slot
   */
  private static selectMealForSlot(
    baseMeals: MealPlanTemplate[],
    timing: string,
    dayIndex: number,
    mealIndex: number,
    questionnaire: any
  ): MealPlanTemplate {
    // Find meals that match the timing
    const matchingMeals = baseMeals.filter(meal => meal.meal_timing === timing);
    
    if (matchingMeals.length === 0) {
      // Create a generic meal if no match found
      return this.createGenericMeal(timing, questionnaire);
    }

    // Select meal based on day rotation
    const selectedMeal = matchingMeals[dayIndex % matchingMeals.length];
    
    // Create unique template ID for this instance
    return {
      ...selectedMeal,
      template_id: `${selectedMeal.template_id}_day${dayIndex}_${timing.toLowerCase()}`
    };
  }

  /**
   * Create generic meal template
   */
  private static createGenericMeal(timing: string, questionnaire: any): MealPlanTemplate {
    const baseCalories = timing === 'BREAKFAST' ? 400 : timing === 'LUNCH' ? 500 : 450;
    
    return {
      template_id: `generic_${timing.toLowerCase()}_${Date.now()}`,
      name: `Balanced ${timing.charAt(0) + timing.slice(1).toLowerCase()}`,
      description: `Nutritious ${timing.toLowerCase()} meal`,
      meal_timing: timing,
      dietary_category: 'BALANCED',
      prep_time_minutes: 20,
      difficulty_level: 2,
      calories: baseCalories,
      protein_g: Math.round(baseCalories * 0.25 / 4),
      carbs_g: Math.round(baseCalories * 0.45 / 4),
      fats_g: Math.round(baseCalories * 0.30 / 9),
      fiber_g: 5,
      sugar_g: 5,
      sodium_mg: 400,
      ingredients: ['mixed ingredients'],
      instructions: ['Prepare according to dietary preferences'],
      allergens: [],
      image_url: null,
      created_at: new Date(),
      updated_at: new Date(),
      is_active: true
    };
  }

  /**
   * Create meal templates and schedules in database
   */
  private static async createMealTemplatesAndSchedules(
    planId: string,
    weeklyPlan: WeeklyMealPlan
  ): Promise<void> {
    try {
      console.log("📝 Creating meal templates and schedules...");

      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      
      for (const [dayName, dayMeals] of Object.entries(weeklyPlan)) {
        const dayIndex = dayNames.indexOf(dayName);
        
        for (const [timing, meals] of Object.entries(dayMeals)) {
          for (let mealOrder = 0; mealOrder < meals.length; mealOrder++) {
            const meal = meals[mealOrder];
            
            // Create meal template
            const template = await prisma.mealTemplate.create({
              data: {
                name: meal.name,
                description: meal.description,
                meal_timing: meal.meal_timing as any,
                dietary_category: meal.dietary_category as any,
                prep_time_minutes: meal.prep_time_minutes,
                difficulty_level: meal.difficulty_level,
                calories: meal.calories,
                protein_g: meal.protein_g,
                carbs_g: meal.carbs_g,
                fats_g: meal.fats_g,
                fiber_g: meal.fiber_g,
                sugar_g: meal.sugar_g,
                sodium_mg: meal.sodium_mg,
                ingredients_json: meal.ingredients,
                instructions_json: meal.instructions,
                allergens_json: meal.allergens,
                image_url: meal.image_url,
                is_active: meal.is_active
              }
            });

            // Create schedule entry
            await prisma.mealPlanSchedule.create({
              data: {
                plan_id: planId,
                template_id: template.template_id,
                day_of_week: dayIndex,
                meal_timing: meal.meal_timing as any,
                meal_order: mealOrder + 1,
                portion_multiplier: 1.0,
                is_optional: false
              }
            });
          }
        }
      }

      console.log("✅ Meal templates and schedules created successfully");
    } catch (error) {
      console.error("💥 Error creating templates and schedules:", error);
      throw error;
    }
  }

  /**
   * Calculate total meals in plan
   */
  private static calculateTotalMeals(config: UserMealPlanConfig): number {
    return (config.meals_per_day + config.snacks_per_day) * config.rotation_frequency_days;
  }

  /**
   * Build comprehensive meal plan prompt for AI
   */
  private static buildMealPlanPrompt(
    config: UserMealPlanConfig,
    questionnaire: any,
    nutritionTargets: any
  ): string {
    return `Create a comprehensive ${config.rotation_frequency_days}-day meal plan.

USER PROFILE:
- Age: ${questionnaire.age}
- Weight: ${questionnaire.weight_kg}kg
- Height: ${questionnaire.height_cm}cm
- Goal: ${questionnaire.main_goal}
- Activity Level: ${questionnaire.physical_activity_level}
- Dietary Style: ${questionnaire.dietary_style}
- Allergies: ${questionnaire.allergies?.join(', ') || 'None'}
- Dislikes: ${questionnaire.disliked_foods?.join(', ') || 'None'}
- Cooking Preference: ${questionnaire.cooking_preference}
- Available Cooking Time: ${questionnaire.daily_cooking_time || '30 minutes'}

NUTRITION TARGETS (Daily):
- Calories: ${nutritionTargets.calories}
- Protein: ${nutritionTargets.protein}g
- Carbs: ${nutritionTargets.carbs}g
- Fats: ${nutritionTargets.fats}g

PLAN REQUIREMENTS:
- ${config.meals_per_day} main meals + ${config.snacks_per_day} snacks per day
- ${config.rotation_frequency_days} days rotation
- Dietary Preferences: ${config.dietary_preferences.join(', ') || 'None'}
- Excluded Ingredients: ${config.excluded_ingredients.join(', ') || 'None'}
- Include Leftovers: ${config.include_leftovers ? 'Yes' : 'No'}
- Fixed Meal Times: ${config.fixed_meal_times ? 'Yes' : 'No'}

Return a JSON object with this structure:
{
  "weekly_plan": [
    {
      "day": "Monday",
      "day_index": 0,
      "meals": [
        {
          "name": "Meal name",
          "description": "Detailed description",
          "meal_timing": "BREAKFAST/LUNCH/DINNER/SNACK",
          "dietary_category": "BALANCED/HIGH_PROTEIN/LOW_CARB/etc",
          "prep_time_minutes": number,
          "difficulty_level": 1-5,
          "calories": number,
          "protein_g": number,
          "carbs_g": number,
          "fats_g": number,
          "fiber_g": number,
          "sugar_g": number,
          "sodium_mg": number,
          "ingredients": ["ingredient1", "ingredient2"],
          "instructions": ["step1", "step2"],
          "allergens": ["allergen1"],
          "image_url": null,
          "portion_multiplier": 1.0,
          "is_optional": false
        }
      ]
    }
  ]
}

Ensure meals are varied, nutritionally balanced, and respect all dietary restrictions and preferences.`;
  }

  /**
   * Convert AI response to weekly plan format
   */
  private static convertAIResponseToWeeklyPlan(aiResponse: any): WeeklyMealPlan {
    const weeklyPlan: WeeklyMealPlan = {};

    if (aiResponse.weekly_plan && Array.isArray(aiResponse.weekly_plan)) {
      aiResponse.weekly_plan.forEach((dayPlan: any) => {
        const dayName = dayPlan.day;
        weeklyPlan[dayName] = {};

        if (dayPlan.meals && Array.isArray(dayPlan.meals)) {
          dayPlan.meals.forEach((meal: any) => {
            const timing = meal.meal_timing;
            
            if (!weeklyPlan[dayName][timing]) {
              weeklyPlan[dayName][timing] = [];
            }

            const mealTemplate: MealPlanTemplate = {
              template_id: `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              name: meal.name,
              description: meal.description,
              meal_timing: timing,
              dietary_category: meal.dietary_category || 'BALANCED',
              prep_time_minutes: meal.prep_time_minutes || 30,
              difficulty_level: meal.difficulty_level || 2,
              calories: meal.calories || 0,
              protein_g: meal.protein_g || 0,
              carbs_g: meal.carbs_g || 0,
              fats_g: meal.fats_g || 0,
              fiber_g: meal.fiber_g || 0,
              sugar_g: meal.sugar_g || 0,
              sodium_mg: meal.sodium_mg || 0,
              ingredients: Array.isArray(meal.ingredients) ? meal.ingredients : [],
              instructions: Array.isArray(meal.instructions) ? meal.instructions : [],
              allergens: Array.isArray(meal.allergens) ? meal.allergens : [],
              image_url: meal.image_url || null,
              created_at: new Date(),
              updated_at: new Date(),
              is_active: true
            };

            weeklyPlan[dayName][timing].push(mealTemplate);
          });
        }
      });
    }

    return weeklyPlan;
  }

  /**
   * Replace meal in existing plan
   */
  static async replaceMealInPlan(
    userId: string,
    planId: string,
    dayOfWeek: number,
    mealTiming: string,
    mealOrder: number,
    preferences: any = {}
  ): Promise<any> {
    try {
      console.log("🔄 Replacing meal in plan:", { planId, dayOfWeek, mealTiming, mealOrder });

      // Get current meal schedule
      const currentSchedule = await prisma.mealPlanSchedule.findFirst({
        where: {
          plan_id: planId,
          day_of_week: dayOfWeek,
          meal_timing: mealTiming as any,
          meal_order: mealOrder
        },
        include: {
          template: true,
          plan: true
        }
      });

      if (!currentSchedule) {
        throw new Error("Meal schedule not found");
      }

      // Verify user owns this plan
      if (currentSchedule.plan.user_id !== userId) {
        throw new Error("Access denied");
      }

      // Generate replacement meal
      const replacementMeal = await this.generateReplacementMeal(
        currentSchedule.template,
        preferences,
        userId
      );

      // Create new template
      const newTemplate = await prisma.mealTemplate.create({
        data: {
          name: replacementMeal.name,
          description: replacementMeal.description,
          meal_timing: currentSchedule.template.meal_timing,
          dietary_category: currentSchedule.template.dietary_category,
          prep_time_minutes: replacementMeal.prep_time_minutes,
          difficulty_level: replacementMeal.difficulty_level,
          calories: replacementMeal.calories,
          protein_g: replacementMeal.protein_g,
          carbs_g: replacementMeal.carbs_g,
          fats_g: replacementMeal.fats_g,
          fiber_g: replacementMeal.fiber_g,
          sugar_g: replacementMeal.sugar_g,
          sodium_mg: replacementMeal.sodium_mg,
          ingredients_json: replacementMeal.ingredients,
          instructions_json: replacementMeal.instructions,
          allergens_json: replacementMeal.allergens,
          image_url: null,
          is_active: true
        }
      });

      // Update schedule to use new template
      const updatedSchedule = await prisma.mealPlanSchedule.update({
        where: { schedule_id: currentSchedule.schedule_id },
        data: {
          template_id: newTemplate.template_id
        },
        include: {
          template: true
        }
      });

      console.log("✅ Meal replaced successfully");
      return updatedSchedule;

    } catch (error) {
      console.error("💥 Error replacing meal:", error);
      throw error;
    }
  }

  /**
   * Generate replacement meal
   */
  private static async generateReplacementMeal(
    currentTemplate: any,
    preferences: any,
    userId: string
  ): Promise<any> {
    try {
      // Get user questionnaire for context
      const questionnaire = await prisma.userQuestionnaire.findFirst({
        where: { user_id: userId },
        orderBy: { date_completed: 'desc' }
      });

      // Create replacement with similar nutrition profile but different ingredients
      const alternatives = this.getAlternativeMeals(currentTemplate, questionnaire);
      
      // Select based on preferences or randomly
      const selectedAlternative = preferences.preferred_category
        ? alternatives.find(alt => alt.dietary_category === preferences.preferred_category) || alternatives[0]
        : alternatives[Math.floor(Math.random() * alternatives.length)];

      return selectedAlternative;

    } catch (error) {
      console.error("Error generating replacement meal:", error);
      throw error;
    }
  }

  /**
   * Get alternative meals with similar nutrition profile
   */
  private static getAlternativeMeals(currentTemplate: any, questionnaire: any): any[] {
    const alternatives = [];
    const timing = currentTemplate.meal_timing;
    const targetCalories = currentTemplate.calories || 400;

    // Generate 3 alternatives with similar nutrition but different ingredients
    for (let i = 0; i < 3; i++) {
      alternatives.push({
        name: `Alternative ${timing.charAt(0) + timing.slice(1).toLowerCase()} ${i + 1}`,
        description: `Nutritious alternative for ${timing.toLowerCase()}`,
        prep_time_minutes: (currentTemplate.prep_time_minutes || 30) + (i * 5),
        difficulty_level: Math.min(5, (currentTemplate.difficulty_level || 2) + i),
        calories: targetCalories + (i * 50),
        protein_g: (currentTemplate.protein_g || 20) + (i * 5),
        carbs_g: (currentTemplate.carbs_g || 30) + (i * 10),
        fats_g: (currentTemplate.fats_g || 15) + (i * 3),
        fiber_g: (currentTemplate.fiber_g || 5) + i,
        sugar_g: currentTemplate.sugar_g || 5,
        sodium_mg: (currentTemplate.sodium_mg || 400) - (i * 50),
        ingredients: this.generateAlternativeIngredients(timing, questionnaire),
        instructions: this.generateAlternativeInstructions(timing),
        allergens: this.filterAllergensForUser(questionnaire)
      });
    }

    return alternatives;
  }

  /**
   * Generate alternative ingredients based on dietary preferences
   */
  private static generateAlternativeIngredients(timing: string, questionnaire: any): string[] {
    const baseIngredients = {
      'BREAKFAST': ['oats', 'berries', 'nuts', 'yogurt', 'honey'],
      'LUNCH': ['quinoa', 'vegetables', 'legumes', 'olive oil', 'herbs'],
      'DINNER': ['brown rice', 'lean protein', 'vegetables', 'spices', 'healthy fats']
    };

    let ingredients = baseIngredients[timing] || baseIngredients['LUNCH'];

    // Adjust for dietary style
    if (questionnaire?.dietary_style?.toLowerCase().includes('vegetarian')) {
      ingredients = ingredients.map(ing => 
        ing === 'lean protein' ? 'tofu' : ing
      );
    }

    // Remove allergens
    if (questionnaire?.allergies) {
      ingredients = ingredients.filter(ing => 
        !questionnaire.allergies.some((allergen: string) => 
          ing.toLowerCase().includes(allergen.toLowerCase())
        )
      );
    }

    return ingredients;
  }

  /**
   * Generate alternative cooking instructions
   */
  private static generateAlternativeInstructions(timing: string): string[] {
    const instructions = {
      'BREAKFAST': [
        'Prepare ingredients',
        'Combine in bowl',
        'Mix well',
        'Serve fresh'
      ],
      'LUNCH': [
        'Prep vegetables',
        'Cook grains',
        'Combine ingredients',
        'Season to taste',
        'Serve warm'
      ],
      'DINNER': [
        'Preheat cooking surface',
        'Prepare protein',
        'Cook vegetables',
        'Combine all ingredients',
        'Season and serve'
      ]
    };

    return instructions[timing] || instructions['LUNCH'];
  }

  /**
   * Filter allergens based on user profile
   */
  private static filterAllergensForUser(questionnaire: any): string[] {
    const commonAllergens = ['nuts', 'dairy', 'eggs', 'gluten', 'soy'];
    
    if (!questionnaire?.allergies) {
      return [];
    }

    return commonAllergens.filter(allergen => 
      !questionnaire.allergies.some((userAllergen: string) => 
        allergen.toLowerCase().includes(userAllergen.toLowerCase())
      )
    );
  }

  /**
   * Activate meal plan
   */
  static async activatePlan(userId: string, planId: string): Promise<any> {
    try {
      console.log("🚀 Activating meal plan:", planId);

      // Deactivate other plans
      await this.deactivateUserPlans(userId);

      // Activate selected plan
      const activatedPlan = await prisma.userMealPlan.update({
        where: { plan_id: planId },
        data: {
          is_active: true,
          status: 'active',
          start_date: new Date()
        }
      });

      // Update user's active plan reference
      await prisma.user.update({
        where: { user_id: userId },
        data: {
          active_meal_plan_id: planId
        }
      });

      console.log("✅ Meal plan activated successfully");
      return activatedPlan;

    } catch (error) {
      console.error("💥 Error activating meal plan:", error);
      throw error;
    }
  }

  /**
   * Deactivate all user plans
   */
  static async deactivateUserPlans(userId: string): Promise<void> {
    await prisma.userMealPlan.updateMany({
      where: { user_id: userId },
      data: { is_active: false }
    });
  }

  /**
   * Deactivate specific meal plan
   */
  static async deactivateMealPlan(userId: string, planId: string): Promise<void> {
    await prisma.userMealPlan.updateMany({
      where: {
        plan_id: planId,
        user_id: userId
      },
      data: { is_active: false }
    });

    // Clear user's active plan reference if this was the active plan
    await prisma.user.updateMany({
      where: {
        user_id: userId,
        active_meal_plan_id: planId
      },
      data: {
        active_meal_plan_id: null
      }
    });
  }

  /**
   * Complete meal plan with feedback
   */
  static async completePlan(
    userId: string,
    planId: string,
    feedback: {
      rating?: number;
      liked?: string;
      disliked?: string;
      suggestions?: string;
    }
  ): Promise<{ message: string }> {
    try {
      await prisma.userMealPlan.updateMany({
        where: {
          plan_id: planId,
          user_id: userId
        },
        data: {
          status: 'completed',
          completed_at: new Date(),
          rating: feedback.rating,
          feedback_liked: feedback.liked,
          feedback_disliked: feedback.disliked,
          feedback_suggestions: feedback.suggestions,
          is_active: false
        }
      });

      // Clear active plan reference
      await prisma.user.updateMany({
        where: {
          user_id: userId,
          active_meal_plan_id: planId
        },
        data: {
          active_meal_plan_id: null
        }
      });

      return { message: "Meal plan completed successfully" };

    } catch (error) {
      console.error("Error completing meal plan:", error);
      throw error;
    }
  }

  /**
   * Save meal preference
   */
  static async saveMealPreference(
    userId: string,
    templateId: string,
    preferenceType: string,
    rating?: number,
    notes?: string
  ): Promise<any> {
    return await prisma.userMealPreference.upsert({
      where: {
        user_id_template_id_preference_type: {
          user_id: userId,
          template_id: templateId,
          preference_type: preferenceType
        }
      },
      update: {
        rating,
        notes,
        updated_at: new Date()
      },
      create: {
        user_id: userId,
        template_id: templateId,
        preference_type: preferenceType,
        rating,
        notes
      }
    });
  }

  /**
   * Save plan feedback
   */
  static async savePlanFeedback(
    userId: string,
    planId: string,
    rating: number,
    liked: string,
    disliked: string,
    suggestions: string
  ): Promise<void> {
    await prisma.userMealPlan.updateMany({
      where: {
        plan_id: planId,
        user_id: userId
      },
      data: {
        rating,
        feedback_liked: liked,
        feedback_disliked: disliked,
        feedback_suggestions: suggestions,
        updated_at: new Date()
      }
    });
  }

  /**
   * Generate shopping list for meal plan
   */
  static async generateShoppingList(
    userId: string,
    planId: string,
    weekStartDate: string
  ): Promise<any> {
    try {
      console.log("🛒 Generating shopping list for plan:", planId);

      const plan = await prisma.userMealPlan.findFirst({
        where: {
          plan_id: planId,
          user_id: userId
        },
        include: {
          schedules: {
            include: {
              template: true
            }
          }
        }
      });

      if (!plan) {
        throw new Error("Meal plan not found");
      }

      // Aggregate ingredients from all meals
      const ingredientMap = new Map<string, any>();

      plan.schedules.forEach(schedule => {
        const ingredients = schedule.template.ingredients_json as string[] || [];
        
        ingredients.forEach(ingredient => {
          const key = ingredient.toLowerCase();
          if (ingredientMap.has(key)) {
            const existing = ingredientMap.get(key);
            existing.quantity += 1; // Simple quantity increment
          } else {
            ingredientMap.set(key, {
              name: ingredient,
              quantity: 1,
              unit: 'piece',
              category: this.categorizeIngredient(ingredient),
              estimated_cost: this.estimateIngredientCost(ingredient)
            });
          }
        });
      });

      // Save shopping list items
      const items = Array.from(ingredientMap.values());
      const shoppingListPromises = items.map(item =>
        prisma.shoppingList.create({
          data: {
            user_id: userId,
            plan_id: planId,
            name: item.name,
            quantity: item.quantity,
            unit: item.unit,
            category: item.category,
            estimated_cost: item.estimated_cost,
            added_from: 'meal_plan'
          }
        })
      );

      await Promise.all(shoppingListPromises);

      console.log("✅ Shopping list generated successfully");
      return {
        plan_id: planId,
        items,
        total_items: items.length,
        total_estimated_cost: items.reduce((sum, item) => sum + item.estimated_cost, 0),
        generated_at: new Date().toISOString()
      };

    } catch (error) {
      console.error("💥 Error generating shopping list:", error);
      throw error;
    }
  }

  /**
   * Categorize ingredient for shopping list
   */
  private static categorizeIngredient(ingredient: string): string {
    const categories = {
      'Protein': ['chicken', 'beef', 'fish', 'salmon', 'tuna', 'eggs', 'tofu', 'tempeh', 'beans', 'lentils'],
      'Vegetables': ['spinach', 'broccoli', 'carrots', 'peppers', 'onions', 'tomatoes', 'lettuce', 'cucumber'],
      'Fruits': ['apple', 'banana', 'berries', 'orange', 'lemon', 'lime', 'grapes'],
      'Grains': ['rice', 'quinoa', 'oats', 'bread', 'pasta', 'barley'],
      'Dairy': ['milk', 'cheese', 'yogurt', 'butter'],
      'Pantry': ['oil', 'vinegar', 'spices', 'herbs', 'salt', 'pepper', 'honey']
    };

    const lowerIngredient = ingredient.toLowerCase();
    
    for (const [category, items] of Object.entries(categories)) {
      if (items.some(item => lowerIngredient.includes(item))) {
        return category;
      }
    }

    return 'Other';
  }

  /**
   * Estimate ingredient cost
   */
  private static estimateIngredientCost(ingredient: string): number {
    const costMap = {
      'protein': 15,
      'vegetables': 5,
      'fruits': 8,
      'grains': 3,
      'dairy': 6,
      'pantry': 2
    };

    const category = this.categorizeIngredient(ingredient).toLowerCase();
    return costMap[category] || 5;
  }
}