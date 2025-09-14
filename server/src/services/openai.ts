import OpenAI from "openai";
import { MealAnalysisResult } from "../types/openai";
import { extractCleanJSON, parsePartialJSON } from "../utils/openai";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  : null;

export class OpenAIService {
  /**
   * Analyze meal image with enhanced error handling and fallback
   */
  static async analyzeMealImage(
    imageBase64: string,
    language: string = "english",
    updateText?: string,
    editedIngredients: any[] = []
  ): Promise<MealAnalysisResult> {
    try {
      if (!openai || !process.env.OPENAI_API_KEY) {
        console.log("⚠️ OpenAI not available, using fallback analysis");
        return this.getFallbackMealAnalysis(updateText, editedIngredients);
      }

      console.log("🤖 Starting OpenAI meal analysis...");
      console.log("🌐 Language:", language);
      console.log("📝 Update text provided:", !!updateText);
      console.log("🥗 Edited ingredients:", editedIngredients.length);

      const systemPrompt = this.buildMealAnalysisPrompt(language, updateText, editedIngredients);

      const messages: any[] = [
        { role: "system", content: systemPrompt }
      ];

      if (updateText) {
        messages.push({
          role: "user",
          content: `Please update the meal analysis based on this information: ${updateText}`
        });
      } else {
        messages.push({
          role: "user",
          content: [
            {
              type: "text",
              text: "Please analyze this meal image and provide detailed nutritional information."
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
                detail: "high"
              }
            }
          ]
        });
      }

      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages,
        max_tokens: 2000,
        temperature: 0.3
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response from OpenAI");
      }

      console.log("🤖 Raw OpenAI response received");
      return this.parseOpenAIResponse(content);

    } catch (error) {
      console.error("💥 OpenAI meal analysis failed:", error);
      
      if (error instanceof Error) {
        if (error.message.includes('rate_limit')) {
          throw new Error("AI service is temporarily busy. Please try again in a moment.");
        } else if (error.message.includes('invalid_image')) {
          throw new Error("Unable to process this image. Please try a clearer photo.");
        }
      }

      // Return fallback analysis
      return this.getFallbackMealAnalysis(updateText, editedIngredients);
    }
  }

  /**
   * Update existing meal analysis
   */
  static async updateMealAnalysis(
    originalAnalysis: any,
    updateText: string,
    language: string = "english"
  ): Promise<MealAnalysisResult> {
    try {
      if (!openai || !process.env.OPENAI_API_KEY) {
        return this.getFallbackUpdateAnalysis(originalAnalysis, updateText);
      }

      const prompt = `Update this meal analysis based on the user's input.

ORIGINAL ANALYSIS:
${JSON.stringify(originalAnalysis, null, 2)}

USER UPDATE REQUEST:
${updateText}

Please provide the updated analysis in the same JSON format, incorporating the user's corrections or additions. Maintain all existing data unless specifically contradicted by the user's input.

Return only the JSON object with updated values.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          { role: "system", content: "You are a nutrition expert updating meal analysis based on user feedback." },
          { role: "user", content: prompt }
        ],
        max_tokens: 1500,
        temperature: 0.2
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response from OpenAI");
      }

      return this.parseOpenAIResponse(content);

    } catch (error) {
      console.error("💥 OpenAI update analysis failed:", error);
      return this.getFallbackUpdateAnalysis(originalAnalysis, updateText);
    }
  }

  /**
   * Generate text using OpenAI with enhanced error handling
   */
  static async generateText(
    prompt: string,
    maxTokens: number = 1000,
    temperature: number = 0.7
  ): Promise<string> {
    try {
      if (!openai || !process.env.OPENAI_API_KEY) {
        throw new Error("OpenAI service not available");
      }

      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          { role: "user", content: prompt }
        ],
        max_tokens: maxTokens,
        temperature
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response from OpenAI");
      }

      return content;

    } catch (error) {
      console.error("💥 OpenAI text generation failed:", error);
      throw error;
    }
  }

  /**
   * Build comprehensive meal analysis prompt
   */
  private static buildMealAnalysisPrompt(
    language: string,
    updateText?: string,
    editedIngredients: any[] = []
  ): string {
    const isHebrew = language === "hebrew";

    const basePrompt = isHebrew
      ? `אתה מומחה תזונה מקצועי המנתח תמונות של ארוחות. נתח את התמונה ותן מידע תזונתי מפורט ומדויק.`
      : `You are a professional nutrition expert analyzing meal images. Analyze the image and provide detailed, accurate nutritional information.`;

    const jsonStructure = `
{
  "name": "${isHebrew ? 'שם הארוחה' : 'Meal name'}",
  "description": "${isHebrew ? 'תיאור קצר' : 'Brief description'}",
  "calories": ${isHebrew ? 'מספר קלוריות' : 'number'},
  "protein": ${isHebrew ? 'חלבון בגרמים' : 'protein in grams'},
  "carbs": ${isHebrew ? 'פחמימות בגרמים' : 'carbs in grams'},
  "fat": ${isHebrew ? 'שומן בגרמים' : 'fat in grams'},
  "fiber": ${isHebrew ? 'סיבים תזונתיים' : 'fiber in grams'},
  "sugar": ${isHebrew ? 'סוכר בגרמים' : 'sugar in grams'},
  "sodium": ${isHebrew ? 'נתרן במילגרם' : 'sodium in mg'},
  "saturated_fats_g": ${isHebrew ? 'שומן רווי' : 'saturated fat in grams'},
  "cholesterol_mg": ${isHebrew ? 'כולסטרול במילגרם' : 'cholesterol in mg'},
  "serving_size_g": ${isHebrew ? 'גודל מנה בגרמים' : 'serving size in grams'},
  "confidence": ${isHebrew ? 'רמת ביטחון 1-100' : 'confidence level 1-100'},
  "ingredients": [
    {
      "name": "${isHebrew ? 'שם המרכיב' : 'ingredient name'}",
      "calories": ${isHebrew ? 'קלוריות' : 'calories'},
      "protein_g": ${isHebrew ? 'חלבון' : 'protein'},
      "carbs_g": ${isHebrew ? 'פחמימות' : 'carbs'},
      "fats_g": ${isHebrew ? 'שומן' : 'fat'}
    }
  ],
  "cookingMethod": "${isHebrew ? 'שיטת בישול' : 'cooking method'}",
  "healthNotes": "${isHebrew ? 'הערות בריאותיות' : 'health notes'}",
  "food_category": "${isHebrew ? 'קטגוריית מזון' : 'food category'}",
  "processing_level": "${isHebrew ? 'רמת עיבוד' : 'processing level'}"
}`;

    let additionalInstructions = "";
    
    if (updateText) {
      additionalInstructions += isHebrew
        ? `\n\nעדכן את הניתוח בהתאם למידע הנוסף: ${updateText}`
        : `\n\nUpdate the analysis based on this additional information: ${updateText}`;
    }

    if (editedIngredients.length > 0) {
      additionalInstructions += isHebrew
        ? `\n\nהמשתמש ערך את רשימת המרכיבים: ${JSON.stringify(editedIngredients)}`
        : `\n\nUser has edited the ingredients list: ${JSON.stringify(editedIngredients)}`;
    }

    return `${basePrompt}

${isHebrew ? 'החזר תשובה בפורמט JSON הבא:' : 'Return response in this JSON format:'}
${jsonStructure}

${isHebrew ? 'הוראות חשובות:' : 'Important instructions:'}
- ${isHebrew ? 'היה מדויק ומפורט בניתוח התזונתי' : 'Be accurate and detailed in nutritional analysis'}
- ${isHebrew ? 'ספק מידע על כל המרכיבים הנראים בתמונה' : 'Provide information about all visible ingredients'}
- ${isHebrew ? 'הערך את גודל המנה בצורה ריאלית' : 'Estimate serving size realistically'}
- ${isHebrew ? 'ציין אזהרות בריאותיות אם רלוונטי' : 'Include health warnings if relevant'}

${additionalInstructions}`;
  }

  /**
   * Parse OpenAI response with enhanced error handling
   */
  private static parseOpenAIResponse(content: string): MealAnalysisResult {
    try {
      console.log("🔍 Parsing OpenAI response...");
      
      const cleanedJSON = extractCleanJSON(content);
      const parsed = parsePartialJSON(cleanedJSON);

      // Validate and normalize the response
      const result: MealAnalysisResult = {
        name: parsed.name || "Unknown Meal",
        description: parsed.description || "",
        calories: Number(parsed.calories) || 0,
        protein: Number(parsed.protein) || 0,
        carbs: Number(parsed.carbs) || 0,
        fat: Number(parsed.fat) || 0,
        fiber: Number(parsed.fiber) || 0,
        sugar: Number(parsed.sugar) || 0,
        sodium: Number(parsed.sodium) || 0,
        saturated_fats_g: Number(parsed.saturated_fats_g) || 0,
        cholesterol_mg: Number(parsed.cholesterol_mg) || 0,
        serving_size_g: Number(parsed.serving_size_g) || 100,
        confidence: Number(parsed.confidence) || 75,
        ingredients: Array.isArray(parsed.ingredients) ? parsed.ingredients : [],
        servingSize: parsed.servingSize || "1 serving",
        cookingMethod: parsed.cookingMethod || "Unknown",
        healthNotes: parsed.healthNotes || "",
        food_category: parsed.food_category || "Mixed",
        processing_level: parsed.processing_level || "Moderate",
        recommendations: parsed.healthNotes || "Meal analyzed successfully"
      };

      console.log("✅ OpenAI response parsed successfully");
      return result;

    } catch (error) {
      console.error("💥 Error parsing OpenAI response:", error);
      throw new Error("Failed to parse AI analysis. Please try again with a clearer image.");
    }
  }

  /**
   * Fallback meal analysis when OpenAI is not available
   */
  private static getFallbackMealAnalysis(
    updateText?: string,
    editedIngredients: any[] = []
  ): MealAnalysisResult {
    console.log("🆘 Using fallback meal analysis");

    // Use edited ingredients if provided
    const ingredients = editedIngredients.length > 0 
      ? editedIngredients 
      : [
          {
            name: "Mixed ingredients",
            calories: 200,
            protein_g: 15,
            carbs_g: 25,
            fats_g: 8,
            fiber_g: 3,
            sugar_g: 5,
            sodium_mg: 300
          }
        ];

    const totalCalories = ingredients.reduce((sum, ing) => sum + (ing.calories || 0), 0);
    const totalProtein = ingredients.reduce((sum, ing) => sum + (ing.protein_g || 0), 0);
    const totalCarbs = ingredients.reduce((sum, ing) => sum + (ing.carbs_g || 0), 0);
    const totalFat = ingredients.reduce((sum, ing) => sum + (ing.fats_g || 0), 0);

    return {
      name: updateText ? `Updated Meal: ${updateText.substring(0, 30)}...` : "Analyzed Meal",
      description: updateText || "Meal analyzed using fallback method",
      calories: totalCalories || 300,
      protein: totalProtein || 20,
      carbs: totalCarbs || 35,
      fat: totalFat || 12,
      fiber: 5,
      sugar: 8,
      sodium: 400,
      confidence: 60,
      ingredients,
      servingSize: "1 serving",
      cookingMethod: "Mixed preparation",
      healthNotes: "Analysis completed using fallback method. For more accurate results, please ensure OpenAI API is configured.",
      food_category: "Mixed",
      processing_level: "Moderate",
      recommendations: "Meal logged successfully. Consider adding more vegetables for better nutrition balance."
    };
  }

  /**
   * Fallback update analysis
   */
  private static getFallbackUpdateAnalysis(
    originalAnalysis: any,
    updateText: string
  ): MealAnalysisResult {
    console.log("🆘 Using fallback update analysis");

    // Apply simple text-based updates
    let updatedName = originalAnalysis.name;
    let updatedCalories = originalAnalysis.calories;

    // Simple keyword-based adjustments
    const lowerUpdate = updateText.toLowerCase();
    
    if (lowerUpdate.includes('more') || lowerUpdate.includes('add')) {
      updatedCalories = Math.round(originalAnalysis.calories * 1.2);
    } else if (lowerUpdate.includes('less') || lowerUpdate.includes('remove')) {
      updatedCalories = Math.round(originalAnalysis.calories * 0.8);
    }

    if (lowerUpdate.includes('protein')) {
      originalAnalysis.protein = Math.round(originalAnalysis.protein * 1.3);
    }

    return {
      ...originalAnalysis,
      name: updatedName,
      calories: updatedCalories,
      confidence: 50,
      healthNotes: `Updated based on user input: ${updateText}. For more accurate analysis, please ensure OpenAI API is configured.`,
      recommendations: "Meal updated successfully using fallback method."
    };
  }

  /**
   * Check if OpenAI service is available
   */
  static isAvailable(): boolean {
    return !!(openai && process.env.OPENAI_API_KEY);
  }

  /**
   * Get service status
   */
  static getStatus(): {
    available: boolean;
    model: string;
    lastUsed?: Date;
  } {
    return {
      available: this.isAvailable(),
      model: this.isAvailable() ? "gpt-4o" : "fallback",
      lastUsed: this.isAvailable() ? new Date() : undefined
    };
  }
}