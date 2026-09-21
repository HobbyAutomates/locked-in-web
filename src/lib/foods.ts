// Per-100 g values. Cooked unless the name says raw. Units are typical Indian household sizes.
export type Food = {
  id: string;
  name: string;
  aliases: string[];
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  unit?: string;
  unitGrams?: number;
};

const f = (
  id: string,
  name: string,
  aliases: string[],
  calories: number,
  protein: number,
  carbs: number,
  fat: number,
  unit?: string,
  unitGrams?: number,
): Food => ({ id, name, aliases, calories, protein, carbs, fat, unit, unitGrams });

export const FOODS: Food[] = [
  // Grains
  f("rice-cooked", "Rice, cooked", ["rice", "white rice", "steamed rice", "chawal", "jeera rice"], 130, 2.7, 28, 0.3, "bowl", 150),
  f("rice-raw", "Rice, raw", ["raw rice", "uncooked rice"], 360, 7, 79, 0.6, "cup", 185),
  f("brown-rice-cooked", "Brown rice, cooked", ["brown rice"], 123, 2.7, 26, 1, "bowl", 150),
  f("roti", "Roti / chapati", ["roti", "chapati", "chapathi", "phulka", "rotis", "chapatis"], 264, 8.5, 46, 5.5, "roti", 40),
  f("paratha", "Paratha, plain", ["paratha", "parantha", "parotta"], 320, 6.5, 40, 14, "paratha", 80),
  f("naan", "Naan", ["naan", "butter naan"], 310, 9, 50, 8, "naan", 90),
  f("dosa", "Dosa, plain", ["dosa", "plain dosa"], 168, 4, 28, 4, "dosa", 100),
  f("masala-dosa", "Masala dosa", ["masala dosa"], 190, 4, 30, 6, "dosa", 180),
  f("idli", "Idli", ["idli", "idlis"], 130, 3.5, 27, 0.5, "idli", 40),
  f("upma", "Upma", ["upma", "rava upma"], 140, 3, 22, 4.5, "bowl", 150),
  f("poha", "Poha", ["poha", "aval", "flattened rice"], 130, 2.5, 26, 2, "bowl", 150),
  f("oats-cooked", "Oats, cooked", ["oats", "oatmeal", "porridge"], 71, 2.5, 12, 1.5, "bowl", 200),
  f("oats-dry", "Oats, dry", ["dry oats", "raw oats", "rolled oats"], 380, 13, 67, 7, "cup", 80),
  f("bread-white", "Bread, white", ["bread", "white bread", "toast"], 265, 9, 49, 3.2, "slice", 30),
  f("bread-brown", "Bread, brown", ["brown bread", "wheat bread", "whole wheat bread"], 250, 11, 43, 3.5, "slice", 30),
  f("quinoa-cooked", "Quinoa, cooked", ["quinoa"], 120, 4.4, 21, 1.9, "bowl", 150),
  f("pasta-cooked", "Pasta, cooked", ["pasta", "penne", "spaghetti"], 158, 5.8, 31, 0.9, "bowl", 200),
  f("noodles-cooked", "Noodles, cooked", ["noodles", "maggi", "hakka noodles"], 138, 4.5, 25, 2, "bowl", 200),
  f("biryani-chicken", "Chicken biryani", ["chicken biryani", "biryani"], 180, 9, 22, 6, "plate", 300),
  f("biryani-veg", "Veg biryani", ["veg biryani", "vegetable biryani"], 150, 3.5, 25, 4, "plate", 300),
  f("khichdi", "Khichdi", ["khichdi", "kichdi", "pongal"], 120, 4.5, 20, 2.5, "bowl", 200),

  // Pulses
  f("dal-cooked", "Dal, cooked", ["dal", "daal", "dhal", "toor dal", "moong dal", "masoor dal", "dal fry", "dal tadka", "sambar"], 105, 6.5, 16, 1.5, "bowl", 150),
  f("dal-raw", "Dal, raw", ["raw dal", "uncooked dal"], 340, 24, 60, 1.5, "cup", 200),
  f("rajma", "Rajma, cooked", ["rajma", "kidney beans"], 127, 8.7, 22, 0.5, "bowl", 150),
  f("chole", "Chole, cooked", ["chole", "chana", "chickpeas", "chana masala", "chhole"], 164, 8.9, 27, 2.6, "bowl", 150),
  f("chana-black", "Black chana, cooked", ["kala chana", "black chana"], 160, 9, 25, 3, "bowl", 150),
  f("sprouts", "Sprouts", ["sprouts", "moong sprouts"], 30, 3, 6, 0.2, "bowl", 100),
  f("soya-chunks", "Soya chunks, cooked", ["soya chunks", "soya", "soy chunks", "nutrela"], 140, 20, 12, 1, "bowl", 100),
  f("tofu", "Tofu", ["tofu"], 76, 8, 1.9, 4.8),

  // Dairy
  f("milk-full", "Milk, full cream", ["milk", "full cream milk"], 65, 3.3, 4.8, 3.5, "glass", 250),
  f("milk-toned", "Milk, toned", ["toned milk", "skim milk", "low fat milk"], 45, 3.3, 4.9, 1.5, "glass", 250),
  f("curd", "Curd / dahi", ["curd", "dahi", "yogurt", "yoghurt", "raita"], 62, 3.5, 4.7, 3.3, "bowl", 150),
  f("greek-yogurt", "Greek yogurt", ["greek yogurt", "greek yoghurt", "hung curd"], 97, 9, 3.9, 5, "cup", 170),
  f("paneer", "Paneer", ["paneer", "cottage cheese", "paneer bhurji", "paneer tikka"], 265, 18, 3, 20, "piece", 30),
  f("cheese", "Cheese, processed", ["cheese", "cheese slice", "amul cheese"], 330, 20, 4, 27, "slice", 20),
  f("butter", "Butter", ["butter", "amul butter"], 717, 0.9, 0.1, 81, "tsp", 5),
  f("ghee", "Ghee", ["ghee"], 900, 0, 0, 100, "tsp", 5),
  f("buttermilk", "Buttermilk / chaas", ["buttermilk", "chaas", "chhaas", "lassi"], 40, 2, 4, 1.5, "glass", 250),

  // Eggs, meat, fish
  f("egg", "Egg, whole", ["egg", "eggs", "boiled egg", "boiled eggs", "omelette", "omelet", "fried egg", "scrambled egg"], 155, 13, 1.1, 11, "egg", 50),
  f("egg-white", "Egg white", ["egg white", "egg whites"], 52, 11, 0.7, 0.2, "egg white", 33),
  f("chicken-breast", "Chicken breast, cooked", ["chicken", "chicken breast", "grilled chicken", "boiled chicken", "chicken curry", "chicken tikka"], 165, 31, 0, 3.6, "piece", 100),
  f("chicken-thigh", "Chicken thigh, cooked", ["chicken thigh", "chicken leg", "chicken drumstick"], 209, 26, 0, 11, "piece", 100),
  f("mutton", "Mutton, cooked", ["mutton", "lamb", "goat", "mutton curry"], 260, 25, 0, 17, "bowl", 150),
  f("fish", "Fish, cooked", ["fish", "fish curry", "fish fry", "rohu", "salmon", "tilapia"], 150, 22, 0, 6, "piece", 100),
  f("prawns", "Prawns, cooked", ["prawns", "shrimp"], 99, 24, 0.2, 0.3, "bowl", 100),
  f("tuna", "Tuna, canned", ["tuna", "canned tuna"], 116, 26, 0, 1),

  // Protein supplements
  f("whey", "Whey protein", ["whey", "whey protein", "protein powder", "protein shake", "protein scoop"], 400, 80, 8, 6, "scoop", 30),
  f("peanut-butter", "Peanut butter", ["peanut butter", "pb"], 588, 25, 20, 50, "tbsp", 16),

  // Vegetables
  f("sabzi-mixed", "Mixed vegetable sabzi", ["sabzi", "sabji", "vegetable curry", "mixed veg", "bhaji", "aloo gobi", "bhindi", "cabbage sabzi"], 90, 2.5, 10, 4.5, "bowl", 150),
  f("potato", "Potato, boiled", ["potato", "aloo", "boiled potato"], 87, 1.9, 20, 0.1, "medium", 150),
  f("sweet-potato", "Sweet potato, boiled", ["sweet potato", "shakarkand"], 86, 1.6, 20, 0.1, "medium", 150),
  f("salad", "Salad, mixed", ["salad", "green salad", "cucumber", "tomato", "onion salad"], 20, 1, 4, 0.2, "bowl", 100),
  f("spinach", "Spinach, cooked", ["spinach", "palak", "palak paneer"], 60, 3, 4, 3.5, "bowl", 150),
  f("broccoli", "Broccoli", ["broccoli"], 35, 2.8, 7, 0.4, "cup", 90),
  f("mushroom", "Mushroom, cooked", ["mushroom", "mushrooms"], 40, 3, 4, 1.5, "bowl", 100),
  f("corn", "Corn", ["corn", "sweet corn", "makai"], 96, 3.4, 21, 1.5, "cup", 150),
  f("peas", "Green peas", ["peas", "matar", "green peas"], 81, 5.4, 14, 0.4, "cup", 150),

  // Fruit
  f("banana", "Banana", ["banana", "bananas"], 89, 1.1, 23, 0.3, "banana", 120),
  f("apple", "Apple", ["apple", "apples"], 52, 0.3, 14, 0.2, "apple", 180),
  f("orange", "Orange", ["orange", "oranges", "mosambi"], 47, 0.9, 12, 0.1, "orange", 130),
  f("mango", "Mango", ["mango", "mangoes"], 60, 0.8, 15, 0.4, "mango", 200),
  f("grapes", "Grapes", ["grapes"], 69, 0.7, 18, 0.2, "cup", 150),
  f("papaya", "Papaya", ["papaya"], 43, 0.5, 11, 0.3, "cup", 150),
  f("watermelon", "Watermelon", ["watermelon"], 30, 0.6, 8, 0.2, "cup", 150),
  f("pomegranate", "Pomegranate", ["pomegranate", "anar"], 83, 1.7, 19, 1.2, "cup", 150),
  f("dates", "Dates", ["dates", "khajur"], 277, 1.8, 75, 0.2, "date", 8),

  // Nuts and seeds
  f("almonds", "Almonds", ["almonds", "almond", "badam"], 579, 21, 22, 50, "almond", 1.2),
  f("walnuts", "Walnuts", ["walnuts", "walnut", "akhrot"], 654, 15, 14, 65, "half", 3),
  f("peanuts", "Peanuts", ["peanuts", "groundnuts", "moongphali"], 567, 26, 16, 49, "handful", 30),
  f("cashews", "Cashews", ["cashews", "cashew", "kaju"], 553, 18, 30, 44, "cashew", 1.5),
  f("chia", "Chia seeds", ["chia", "chia seeds"], 486, 17, 42, 31, "tbsp", 12),
  f("flax", "Flax seeds", ["flax", "flaxseed", "alsi"], 534, 18, 29, 42, "tbsp", 10),

  // Snacks and street food
  f("samosa", "Samosa", ["samosa", "samosas"], 262, 5, 30, 14, "samosa", 100),
  f("vada", "Vada", ["vada", "medu vada", "vadas"], 250, 7, 28, 13, "vada", 60),
  f("pakora", "Pakora", ["pakora", "pakoda", "bhajji", "bajji"], 280, 6, 28, 16, "piece", 30),
  f("biscuit", "Biscuit", ["biscuit", "biscuits", "cookie", "cookies", "parle g", "marie"], 460, 6.5, 70, 17, "biscuit", 10),
  f("chips", "Chips", ["chips", "lays", "wafers"], 536, 7, 53, 35, "packet", 30),
  f("chocolate", "Chocolate", ["chocolate", "dairy milk", "kitkat"], 535, 7.5, 59, 30, "bar", 40),
  f("ice-cream", "Ice cream", ["ice cream", "icecream"], 207, 3.5, 24, 11, "scoop", 70),
  f("gulab-jamun", "Gulab jamun", ["gulab jamun"], 340, 4, 50, 14, "piece", 40),
  f("laddu", "Laddu", ["laddu", "ladoo", "laddoo"], 420, 6, 60, 18, "piece", 40),
  f("pizza", "Pizza", ["pizza"], 266, 11, 33, 10, "slice", 100),
  f("burger", "Burger", ["burger"], 295, 15, 30, 13, "burger", 200),
  f("fries", "French fries", ["fries", "french fries"], 312, 3.4, 41, 15, "serving", 120),
  f("momos", "Momos", ["momos", "momo", "dumplings"], 180, 8, 25, 5, "momo", 35),

  // Drinks
  f("tea", "Tea with milk and sugar", ["tea", "chai", "milk tea"], 40, 1, 6, 1.2, "cup", 150),
  f("coffee-milk", "Coffee with milk", ["coffee", "cold coffee", "milk coffee", "latte", "cappuccino"], 45, 1.8, 6, 1.5, "cup", 200),
  f("black-coffee", "Black coffee", ["black coffee", "americano", "espresso"], 2, 0.1, 0, 0, "cup", 200),
  f("juice", "Fruit juice", ["juice", "orange juice", "apple juice", "mango juice"], 46, 0.5, 11, 0.1, "glass", 250),
  f("coke", "Soft drink", ["coke", "pepsi", "soft drink", "cold drink", "soda", "sprite", "thums up"], 42, 0, 10.5, 0, "can", 330),
  f("sugar", "Sugar", ["sugar"], 387, 0, 100, 0, "tsp", 4),
  f("honey", "Honey", ["honey"], 304, 0.3, 82, 0, "tbsp", 21),
  f("oil", "Cooking oil", ["oil", "cooking oil", "olive oil", "sunflower oil"], 884, 0, 0, 100, "tbsp", 14),
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Best-effort match of a food name (from Haiku or the user) to the table. */
export function matchFood(name: string): Food | undefined {
  const n = norm(name);
  if (!n) return undefined;
  // exact id or alias
  for (const food of FOODS) {
    if (food.id === n || norm(food.name) === n) return food;
    if (food.aliases.some((a) => norm(a) === n)) return food;
  }
  // alias contained in the input, longest alias wins
  let best: { food: Food; len: number } | undefined;
  for (const food of FOODS) {
    for (const a of [food.name, ...food.aliases]) {
      const an = norm(a);
      if (an.length >= 3 && (n.includes(an) || an.includes(n)) && (!best || an.length > best.len)) {
        best = { food, len: an.length };
      }
    }
  }
  return best?.food;
}

export const FOOD_NAMES_FOR_PROMPT = FOODS.map((x) => x.name).join("; ");
