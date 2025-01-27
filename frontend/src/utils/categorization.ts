import { Category } from '../types/api';
import Logger from './logger';

interface CategoryRule {
  keywords: string[];
  category: Category;
}

const CATEGORY_RULES: CategoryRule[] = [
  {
    keywords: ['todo', 'task', 'need to', 'should', 'must', 'have to', 'reminder'],
    category: Category.TODO
  },
  {
    keywords: ['idea', 'maybe', 'could', 'what if', 'consider', 'possibility'],
    category: Category.IDEA
  },
  {
    keywords: ['spent', 'minutes', 'hours', 'time', 'worked', 'duration'],
    category: Category.TIME_RECORD
  }
];

export function categorizeText(text: string): Category {
  if (!text) {
    Logger.debug('Empty text provided, defaulting to THOUGHT');
    return Category.THOUGHT;
  }

  const lowerText = text.toLowerCase();
  
  Logger.debug('Categorizing text:', {
    text: text.substring(0, 50) + '...',
    length: text.length
  });

  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some(keyword => lowerText.includes(keyword))) {
      Logger.debug('Category match found:', {
        category: rule.category,
        matchedKeywords: rule.keywords.filter(k => lowerText.includes(k))
      });
      return rule.category;
    }
  }

  // Verify the default category is a valid enum value
  Logger.debug('No category match found, defaulting to THOUGHT', {
    validCategories: Object.values(Category)
  });
  return Category.THOUGHT;
}
