export function extractCleanJSON(content: string): string {
  console.log("🧹 Cleaning JSON content...");
  console.log("📄 Raw content preview:", content.substring(0, 200) + "...");
  
  // Remove markdown code blocks
  let cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "");
  
  // Try to find JSON object boundaries
  const jsonStart = cleaned.indexOf("{");
  if (jsonStart === -1) {
    throw new Error("No JSON object found in response");
  }
  
  // Find the matching closing brace
  let braceCount = 0;
  let jsonEnd = -1;
  
  for (let i = jsonStart; i < cleaned.length; i++) {
    if (cleaned[i] === "{") {
      braceCount++;
    } else if (cleaned[i] === "}") {
      braceCount--;
      if (braceCount === 0) {
        jsonEnd = i;
        break;
      }
    }
  }
  
  if (jsonEnd === -1) {
    console.log("⚠️ No matching closing brace found, using full content");
    jsonEnd = cleaned.length - 1;
  }
  
  const extracted = cleaned.substring(jsonStart, jsonEnd + 1);
  console.log("🎯 Found JSON pattern:", extracted.substring(0, 100) + "...");
  
  // Clean up the extracted JSON
  const finalCleaned = extracted.trim();
  console.log("✅ JSON content cleaned successfully");
  console.log("🔍 Final JSON preview:", finalCleaned.substring(0, 200) + "...");
  
  return finalCleaned;
}

export function parsePartialJSON(content: string): any {
  try {
    // Try to parse as-is first
    return JSON.parse(content);
  } catch (error) {
    console.log("🔧 Standard parsing failed, attempting repair...");
    
    // Remove trailing commas
    let repaired = content.replace(/,(\s*[}\]])/g, '$1');
    
    // Add missing closing braces if needed
    const openBraces = (repaired.match(/\{/g) || []).length;
    const closeBraces = (repaired.match(/\}/g) || []).length;
    
    if (openBraces > closeBraces) {
      const missing = openBraces - closeBraces;
      repaired += '}'.repeat(missing);
    }
    
    try {
      return JSON.parse(repaired);
    } catch (secondError) {
      console.log("💥 Could not repair JSON:", secondError);
      throw new Error("Unable to parse or repair JSON response");
    }
  }
}