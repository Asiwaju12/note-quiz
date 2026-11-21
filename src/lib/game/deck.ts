import type { Deck, Question } from "./types";

type Seed = Omit<Question, "id"> & { id?: string };

const seeds: Seed[] = [
  {
    prompt: "Which part of the brain is the launchpad for new long-term memories?",
    options: ["The hippocampus", "The amygdala", "The cerebellum", "The medulla"],
    answer: 0,
    explanation:
      "The hippocampus helps encode new long-term memories. It is also one of the first regions affected by Alzheimer's.",
    category: "Neuro 101",
  },
  {
    prompt: "The brain's almond-shaped alarm system for fear is called the…",
    options: ["Thalamus", "Amygdala", "Cortex", "Pons"],
    answer: 1,
    explanation: "The amygdala tags experiences with emotion — and emotional events tend to stick in memory.",
    category: "Neuro 101",
  },
  {
    prompt: "Roughly how many neurons are packed into a human brain?",
    options: ["8.6 million", "860 billion", "86 billion", "86 trillion"],
    answer: 2,
    explanation: "About 86 billion neurons, each linked to thousands of others. Your notes have serious hardware.",
    category: "Brainy numbers",
  },
  {
    prompt: "What is the brain's ability to rewire and reorganise itself called?",
    options: ["Neurogenesis", "Myelination", "Neuroplasticity", "Synesthesia"],
    answer: 2,
    explanation: "Neuroplasticity is the brain's lifelong ability to strengthen, weaken and rewire connections.",
    category: "Neuro 101",
  },
  {
    prompt: "Which sleep stage is most strongly linked to memory consolidation?",
    options: ["REM sleep", "Stage 1 sleep", "A midday microsleep", "Waking rest"],
    answer: 0,
    explanation: "REM and deep sleep both help shuffle the day's experiences into long-term storage.",
    category: "Sleep & recall",
  },
  {
    prompt: "Who described the classic 'forgetting curve' of memory?",
    options: ["Ivan Pavlov", "B.F. Skinner", "Sigmund Freud", "Hermann Ebbinghaus"],
    answer: 3,
    explanation: "Ebbinghaus mapped how memories fade over time — and how spaced reviews flatten that curve.",
    category: "Memory history",
  },
  {
    prompt: "The method of loci pairs facts with…",
    options: ["Imagined places", "Favourite songs", "Strong smells", "Colour codes"],
    answer: 0,
    explanation: "Also called a memory palace: you place vivid images along a familiar route, then walk it to recall.",
    category: "Memory hacks",
  },
  {
    prompt: "Spaced repetition works best when review is…",
    options: ["Done all at once", "Spread over time", "Done while distracted", "Left until the last minute"],
    answer: 1,
    explanation: "Short, spaced reviews make the memory work a little harder each time — which is exactly the point.",
    category: "Memory hacks",
  },
  {
    prompt: "Which neurotransmitter is central to reward, motivation and learning?",
    options: ["Insulin", "Dopamine", "Melatonin", "Cortisol"],
    answer: 1,
    explanation: "Dopamine rewards you for seeking and learning, which is why a correct answer feels so good.",
    category: "Neuro 101",
  },
  {
    prompt: "In memory science, what is a 'chunk'?",
    options: ["A bundle of related information", "A single neuron", "One sleep cycle", "A type of brain scan"],
    answer: 0,
    explanation: "Chunking bundles small pieces into one bigger unit, stretching your working memory further.",
    category: "Memory hacks",
  },
  {
    prompt: "The hippocampus is named after which shape?",
    options: ["A walnut", "A star", "A seahorse", "A jellyfish"],
    answer: 2,
    explanation: "Two hippocampi curve like tiny seahorses, one in each half of the brain.",
    category: "Brainy numbers",
  },
  {
    prompt: "What does 'active recall' actually mean?",
    options: ["Rereading your notes", "Highlighting key facts", "Listening to a recap", "Pulling info from memory"],
    answer: 3,
    explanation: "Retrieval is the workout. Trying to remember before checking the answer builds stronger memory.",
    category: "Memory hacks",
  },
  {
    prompt: "About what percentage of body weight does the brain account for?",
    options: ["2%", "10%", "20%", "0.5%"],
    answer: 0,
    explanation: "It's only about 2% of your weight — yet it spends roughly 20% of your energy.",
    category: "Brainy numbers",
  },
  {
    prompt: "Which study move usually boosts later retention the most?",
    options: ["Copying notes verbatim", "Testing yourself", "Watching a recap video", "Reading the chapter twice"],
    answer: 1,
    explanation: "The testing effect: self-testing beats rereading because it forces your brain to retrieve.",
    category: "Study science",
  },
  {
    prompt: "Neurons communicate across tiny gaps known as…",
    options: ["Axons", "Synapses", "Dendrites", "Ventricles"],
    answer: 1,
    explanation: "At a synapse, a signal crosses from one neuron to the next through chemical messengers.",
    category: "Neuro 101",
  },
  {
    prompt: "Which region handles working memory, planning and self-control?",
    options: ["Occipital lobe", "Prefrontal cortex", "Cerebellum", "Brain stem"],
    answer: 1,
    explanation: "The prefrontal cortex is your brain's air traffic control — holding and juggling information.",
    category: "Neuro 101",
  },
  {
    prompt: "What is the spacing effect?",
    options: ["Spaced study beats cramming", "Cramming always wins", "Sleep weakens recall", "Font size changes memory"],
    answer: 0,
    explanation: "Reviewing at intervals improves durable recall compared with the same amount of crammed study.",
    category: "Study science",
  },
  {
    prompt: "Forgetting old facts because new information competes with them is called…",
    options: ["Chunking", "Consolidation", "Priming", "Interference"],
    answer: 3,
    explanation: "Interference is why mixing up similar concepts feels slippery. Compare and contrast to fight back.",
    category: "Memory history",
  },
  {
    prompt: "What is a mnemonic?",
    options: ["A memory aid such as an acronym", "A type of neuron", "A brain scan", "A stage of sleep"],
    answer: 0,
    explanation: "Mnemonics turn boring facts into patterns, rhymes or stories your brain can hook onto.",
    category: "Memory hacks",
  },
  {
    prompt: "When is 'state-dependent' recall strongest?",
    options: ["After a big meal", "In the same state as encoding", "When you change rooms", "Only at night"],
    answer: 1,
    explanation: "Recall improves when your current state resembles the one you learned in — even your location.",
    category: "Memory history",
  },
  {
    prompt: "The classic 'magical number' for working memory is…",
    options: ["7 ± 2 items", "3 ± 1 items", "20 ± 5 items", "50 ± 10 items"],
    answer: 0,
    explanation: "Miller's famous 7 ± 2 is a classic shorthand, though modern estimates often land closer to four chunks.",
    category: "Brainy numbers",
  },
  {
    prompt: "Long-term potentiation is the…",
    options: ["Strengthening of repeated synapse connections", "A laser brain scan", "A permanent loss of neurons", "Growth of new skull"],
    answer: 0,
    explanation: "Neurons that fire together wire together. Repeated use strengthens the synapse — that's LTP.",
    category: "Neuro 101",
  },
  {
    prompt: "What does the cerebellum mainly coordinate?",
    options: ["Smell and taste", "Balance and movement", "Long-term facts", "Immune response"],
    answer: 1,
    explanation: "The cerebellum smooths out movement, balance and motor learning — the 'little brain' at the back.",
    category: "Neuro 101",
  },
  {
    prompt: "The primacy effect means people best remember…",
    options: ["The middle of a list", "The first items in a list", "Only numbers", "Nothing by default"],
    answer: 1,
    explanation: "Early items get extra rehearsal and have a clearer shot at long-term memory, so they stick.",
    category: "Memory history",
  },
  {
    prompt: "Which planet is known as the Red Planet?",
    options: ["Venus", "Mars", "Jupiter", "Mercury"],
    answer: 1,
    explanation: "Iron minerals in the Martian soil oxidise, giving the planet its rusty red colour.",
    category: "Space",
  },
  {
    prompt: "Which is the largest planet in our solar system?",
    options: ["Saturn", "Neptune", "Jupiter", "Earth"],
    answer: 2,
    explanation: "Jupiter is more than twice as massive as all the other planets combined.",
    category: "Space",
  },
  {
    prompt: "What force keeps the planets in orbit around the Sun?",
    options: ["Magnetism", "Gravity", "Friction", "Solar wind"],
    answer: 1,
    explanation: "The Sun's gravity curves space around it, and the planets follow those curves.",
    category: "Space",
  },
  {
    prompt: "Roughly how long does sunlight take to reach Earth?",
    options: ["8 seconds", "8 minutes", "8 hours", "8 days"],
    answer: 1,
    explanation: "Light crosses the 150 million km from the Sun to Earth in about 8 minutes and 20 seconds.",
    category: "Space",
  },
  {
    prompt: "A light-year is a measure of…",
    options: ["Time", "Brightness", "Distance", "Mass"],
    answer: 2,
    explanation: "A light-year is the distance light travels in one year — about 9.46 trillion kilometres.",
    category: "Space",
  },
  {
    prompt: "Which planet has the most extensive ring system?",
    options: ["Mars", "Saturn", "Venus", "Mercury"],
    answer: 1,
    explanation: "Saturn's rings are made of countless chunks of ice and rock, some as small as dust.",
    category: "Space",
  },
  {
    prompt: "The boundary beyond which nothing can escape a black hole is called the…",
    options: ["Event horizon", "Solar apex", "Accretion line", "Photon belt"],
    answer: 0,
    explanation: "Cross the event horizon and escape velocity exceeds light speed — so nothing gets back out.",
    category: "Space",
  },
  {
    prompt: "Which river flows through Egypt and is traditionally called the world's longest?",
    options: ["The Amazon", "The Nile", "The Danube", "The Yangtze"],
    answer: 1,
    explanation: "The Nile runs roughly 6,650 km and has supported Egyptian civilisation for millennia.",
    category: "Geography",
  },
  {
    prompt: "What is the capital city of Australia?",
    options: ["Sydney", "Melbourne", "Canberra", "Perth"],
    answer: 2,
    explanation: "Canberra was purpose-built as a compromise capital between Sydney and Melbourne.",
    category: "Geography",
  },
  {
    prompt: "Which is the largest hot desert on Earth?",
    options: ["The Gobi", "The Sahara", "The Kalahari", "The Mojave"],
    answer: 1,
    explanation: "The Sahara covers around 9 million square kilometres across North Africa.",
    category: "Geography",
  },
  {
    prompt: "Which ocean is the largest by surface area?",
    options: ["Atlantic", "Indian", "Arctic", "Pacific"],
    answer: 3,
    explanation: "The Pacific covers about one-third of the planet and is larger than all land combined.",
    category: "Geography",
  },
  {
    prompt: "Mount Everest sits on the border between Nepal and which country?",
    options: ["India", "China", "Bhutan", "Pakistan"],
    answer: 1,
    explanation: "Everest rises on the Nepal–China border, with the Tibetan side called Qomolangma.",
    category: "Geography",
  },
  {
    prompt: "What is the capital of Canada?",
    options: ["Toronto", "Vancouver", "Ottawa", "Montreal"],
    answer: 2,
    explanation: "Ottawa, in Ontario, became the capital in 1857 and is home to Parliament Hill.",
    category: "Geography",
  },
  {
    prompt: "Which continent contains the most countries?",
    options: ["Asia", "Europe", "Africa", "South America"],
    answer: 2,
    explanation: "Africa has 54 recognised countries, more than any other continent.",
    category: "Geography",
  },
  {
    prompt: "What is the smallest country in the world by area?",
    options: ["Monaco", "Vatican City", "Nauru", "San Marino"],
    answer: 1,
    explanation: "Vatican City covers just 0.49 square kilometres inside Rome.",
    category: "Geography",
  },
  {
    prompt: "In which year did the Berlin Wall fall?",
    options: ["1985", "1989", "1991", "1995"],
    answer: 1,
    explanation: "The wall opened on 9 November 1989 after mass protests across East Germany.",
    category: "History",
  },
  {
    prompt: "Who was the first person to walk on the Moon?",
    options: ["Buzz Aldrin", "Yuri Gagarin", "Neil Armstrong", "Michael Collins"],
    answer: 2,
    explanation: "Armstrong stepped onto the Moon on 20 July 1969 during Apollo 11.",
    category: "History",
  },
  {
    prompt: "The Renaissance began in which country?",
    options: ["France", "Italy", "England", "Spain"],
    answer: 1,
    explanation: "It started in the Italian city-states, especially Florence, in the 14th century.",
    category: "History",
  },
  {
    prompt: "Which ancient civilisation built the pyramids at Giza?",
    options: ["The Romans", "The Greeks", "The Ancient Egyptians", "The Persians"],
    answer: 2,
    explanation: "The Giza pyramids were built as royal tombs around 4,500 years ago.",
    category: "History",
  },
  {
    prompt: "In which year did the Titanic sink?",
    options: ["1905", "1912", "1918", "1923"],
    answer: 1,
    explanation: "RMS Titanic struck an iceberg and sank on 15 April 1912.",
    category: "History",
  },
  {
    prompt: "What is the chemical symbol for gold?",
    options: ["Ag", "Au", "Gd", "Go"],
    answer: 1,
    explanation: "Au comes from the Latin word aurum, meaning gold.",
    category: "Chemistry",
  },
  {
    prompt: "Which gas is most abundant in Earth's atmosphere?",
    options: ["Oxygen", "Carbon dioxide", "Nitrogen", "Argon"],
    answer: 2,
    explanation: "Nitrogen makes up roughly 78% of the atmosphere; oxygen is about 21%.",
    category: "Chemistry",
  },
  {
    prompt: "Which process do plants use to turn light into chemical energy?",
    options: ["Respiration", "Photosynthesis", "Transpiration", "Digestion"],
    answer: 1,
    explanation: "Chlorophyll captures light and drives photosynthesis, producing glucose and oxygen.",
    category: "Biology",
  },
  {
    prompt: "What is the pH of pure water at room temperature?",
    options: ["0", "5", "7", "14"],
    answer: 2,
    explanation: "Pure water is neutral, with a pH of 7 on the scale.",
    category: "Chemistry",
  },
  {
    prompt: "What is the hardest naturally occurring substance on Earth?",
    options: ["Quartz", "Steel", "Diamond", "Granite"],
    answer: 2,
    explanation: "Diamond scores a perfect 10 on the Mohs hardness scale.",
    category: "Geology",
  },
  {
    prompt: "Which gas do humans need to breathe to stay alive?",
    options: ["Nitrogen", "Oxygen", "Hydrogen", "Helium"],
    answer: 1,
    explanation: "Oxygen powers cellular respiration, which releases energy from food.",
    category: "Biology",
  },
  {
    prompt: "The dense centre of an atom is called the…",
    options: ["Electron cloud", "Nucleus", "Orbital", "Ion"],
    answer: 1,
    explanation: "The nucleus holds protons and neutrons, while electrons surround it.",
    category: "Physics",
  },
  {
    prompt: "Which is the fastest land animal?",
    options: ["Lion", "Cheetah", "Pronghorn", "Greyhound"],
    answer: 1,
    explanation: "Cheetahs can reach around 100 km/h in short bursts while hunting.",
    category: "Nature",
  },
  {
    prompt: "What is the largest animal known to have ever existed?",
    options: ["African elephant", "Blue whale", "Brachiosaurus", "Colossal squid"],
    answer: 1,
    explanation: "Blue whales reach around 30 metres and can weigh over 150 tonnes.",
    category: "Nature",
  },
  {
    prompt: "How many hearts does an octopus have?",
    options: ["One", "Two", "Three", "Eight"],
    answer: 2,
    explanation: "Two hearts pump blood to the gills and one pumps it around the body.",
    category: "Nature",
  },
  {
    prompt: "Which mammal lays eggs?",
    options: ["Platypus", "Otter", "Manatee", "Panda"],
    answer: 0,
    explanation: "The platypus is a monotreme: a mammal that lays eggs instead of giving birth.",
    category: "Nature",
  },
  {
    prompt: "A group of crows is collectively known as a…",
    options: ["Murder", "Pack", "Pride", "Gaggle"],
    answer: 0,
    explanation: "A murder of crows is one of the more dramatic collective nouns in English.",
    category: "Nature",
  },
  {
    prompt: "Which tree species includes the tallest living trees on Earth?",
    options: ["Oak", "Coast redwood", "Baobab", "Silver birch"],
    answer: 1,
    explanation: "Coast redwoods in California can exceed 110 metres in height.",
    category: "Nature",
  },
  {
    prompt: "In computing, CPU stands for…",
    options: ["Central Processing Unit", "Computer Power Unit", "Core Program Utility", "Central Program Upload"],
    answer: 0,
    explanation: "The CPU executes instructions and coordinates the rest of the machine.",
    category: "Technology",
  },
  {
    prompt: "Which language is primarily used to style web pages?",
    options: ["HTML", "Python", "CSS", "SQL"],
    answer: 2,
    explanation: "CSS — Cascading Style Sheets — controls layout, colour and typography on the web.",
    category: "Technology",
  },
  {
    prompt: "HTTP stands for…",
    options: ["HyperText Transfer Protocol", "HighTech Transfer Process", "Hyperlink Text Type Protocol", "Host Transfer Protocol"],
    answer: 0,
    explanation: "It is the protocol browsers and servers use to exchange web content.",
    category: "Technology",
  },
  {
    prompt: "Who is widely credited with writing the first computer algorithm?",
    options: ["Alan Turing", "Ada Lovelace", "Grace Hopper", "Charles Babbage"],
    answer: 1,
    explanation: "Lovelace described an algorithm for Babbage's Analytical Engine in the 1840s.",
    category: "Technology",
  },
  {
    prompt: "The binary number 1010 equals which decimal number?",
    options: ["8", "10", "12", "16"],
    answer: 1,
    explanation: "8 + 2 = 10, since binary 1010 has ones in the eights and twos places.",
    category: "Technology",
  },
  {
    prompt: "In a web address, URL stands for…",
    options: ["Universal Reading Link", "Uniform Resource Locator", "Unified Route Layer", "User Reference List"],
    answer: 1,
    explanation: "A URL is the address that identifies a resource on the web.",
    category: "Technology",
  },
  {
    prompt: "What is π rounded to two decimal places?",
    options: ["3.12", "3.14", "3.16", "3.18"],
    answer: 1,
    explanation: "Pi is approximately 3.14159; two decimal places gives 3.14.",
    category: "Maths",
  },
  {
    prompt: "How many sides does a hexagon have?",
    options: ["Five", "Six", "Seven", "Eight"],
    answer: 1,
    explanation: "Hex means six — think of a honeycomb cell.",
    category: "Maths",
  },
  {
    prompt: "Which prime number comes between 10 and 13?",
    options: ["9", "11", "12", "14"],
    answer: 1,
    explanation: "11 has no divisors other than 1 and itself.",
    category: "Maths",
  },
  {
    prompt: "What is 15% of 200?",
    options: ["15", "25", "30", "35"],
    answer: 2,
    explanation: "10% of 200 is 20 and 5% is 10, so 15% is 30.",
    category: "Maths",
  },
  {
    prompt: "A triangle with three equal sides is called…",
    options: ["Isosceles", "Scalene", "Equilateral", "Right-angled"],
    answer: 2,
    explanation: "Equilateral triangles also have three equal angles of 60 degrees.",
    category: "Maths",
  },
  {
    prompt: "Who wrote the play Romeo and Juliet?",
    options: ["Charles Dickens", "William Shakespeare", "Jane Austen", "Oscar Wilde"],
    answer: 1,
    explanation: "Shakespeare wrote the tragedy in the 1590s; it was published in 1597.",
    category: "Literature",
  },
  {
    prompt: "Which word is a synonym for brief?",
    options: ["Lengthy", "Short", "Loud", "Ancient"],
    answer: 1,
    explanation: "Brief and short both describe something lasting a small amount of time.",
    category: "Language",
  },
  {
    prompt: "A word that means the opposite of another is called a(n)…",
    options: ["Synonym", "Antonym", "Homonym", "Acronym"],
    answer: 1,
    explanation: "Antonyms are opposites, while synonyms mean nearly the same thing.",
    category: "Language",
  },
  {
    prompt: "Who wrote the novel Pride and Prejudice?",
    options: ["Charlotte Brontë", "Jane Austen", "Mary Shelley", "Emily Dickinson"],
    answer: 1,
    explanation: "Jane Austen published the novel in 1813, initially anonymously.",
    category: "Literature",
  },
  {
    prompt: "How many letters are in the standard English alphabet?",
    options: ["24", "25", "26", "28"],
    answer: 2,
    explanation: "It runs from A to Z for 26 letters — five of them vowels.",
    category: "Language",
  },
  {
    prompt: "What is the past tense of the verb go?",
    options: ["Goed", "Gone", "Went", "Going"],
    answer: 2,
    explanation: "Go is irregular: go, went, gone.",
    category: "Language",
  },
  {
    prompt: "A group of words containing a subject and a verb is a…",
    options: ["Clause", "Phrase", "Syllable", "Prefix"],
    answer: 0,
    explanation: "A clause has a subject and verb; an independent clause can stand alone.",
    category: "Language",
  },
  {
    prompt: "Who painted the Mona Lisa?",
    options: ["Michelangelo", "Leonardo da Vinci", "Raphael", "Claude Monet"],
    answer: 1,
    explanation: "Leonardo painted it in the early 1500s; it hangs in the Louvre, Paris.",
    category: "Art",
  },
  {
    prompt: "How many strings does a standard guitar have?",
    options: ["Four", "Five", "Six", "Seven"],
    answer: 2,
    explanation: "A standard guitar is tuned E, A, D, G, B, E from low to high.",
    category: "Music",
  },
  {
    prompt: "Which artist famously cut off part of his own ear?",
    options: ["Pablo Picasso", "Vincent van Gogh", "Salvador Dalí", "Andy Warhol"],
    answer: 1,
    explanation: "Van Gogh's ear injury happened in 1888 in Arles, though accounts differ on the details.",
    category: "Art",
  },
  {
    prompt: "What are the three primary colours of light?",
    options: ["Red, yellow, blue", "Red, green, blue", "Cyan, magenta, yellow", "Green, orange, purple"],
    answer: 1,
    explanation: "RGB light adds together to make white; the pigments we mix are different.",
    category: "Science",
  },
  {
    prompt: "Which fruit is especially well known for being rich in potassium?",
    options: ["Apple", "Banana", "Grapes", "Lemon"],
    answer: 1,
    explanation: "One medium banana provides roughly 400 mg of potassium.",
    category: "Food",
  },
  {
    prompt: "Which spice is the most expensive in the world by weight?",
    options: ["Vanilla", "Saffron", "Cardamom", "Cinnamon"],
    answer: 1,
    explanation: "Saffron is harvested by hand from crocus flowers, which keeps its price so high.",
    category: "Food",
  },
  {
    prompt: "Traditional Japanese sake is brewed from which grain?",
    options: ["Wheat", "Rice", "Barley", "Millet"],
    answer: 1,
    explanation: "Sake is made by fermenting polished rice, often called a rice wine but brewed like beer.",
    category: "Food",
  },
  {
    prompt: "How often are the Summer Olympics normally held?",
    options: ["Every two years", "Every three years", "Every four years", "Every five years"],
    answer: 2,
    explanation: "The four-year Olympic cycle is called an Olympiad.",
    category: "Sport",
  },
  {
    prompt: "In which sport is the score zero called love?",
    options: ["Cricket", "Tennis", "Golf", "Snooker"],
    answer: 1,
    explanation: "Tennis uses love for zero; the origin may be the French word for egg, l'oeuf.",
    category: "Sport",
  },
  {
    prompt: "What is the highest possible break in a standard game of snooker?",
    options: ["120", "147", "155", "180"],
    answer: 1,
    explanation: "A 147 maximum uses all fifteen reds with fifteen blacks before the colours.",
    category: "Sport",
  },
  {
    prompt: "Which studio created Mickey Mouse?",
    options: ["Warner Bros.", "Pixar", "Disney", "Universal"],
    answer: 2,
    explanation: "Mickey debuted in Steamboat Willie in 1928 from Walt Disney Studios.",
    category: "Film",
  },
  {
    prompt: "What does the acronym AI stand for?",
    options: ["Automated Input", "Artificial Intelligence", "Advanced Interface", "Applied Information"],
    answer: 1,
    explanation: "Artificial intelligence describes computer systems that perform tasks associated with human intelligence.",
    category: "Technology",
  },
];

export const SAMPLE_DECK: Deck = {
  title: "Random mix",
  kind: "sample",
  questions: seeds.map((seed, index) => ({
    ...seed,
    id: `sample-${index}`,
  })),
};

export function shuffle<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

/** Shuffles the answer options too, so the same fact plays differently each run. */
export function randomizeQuestion(question: Question): Question {
  if (question.type === "tf" || question.options.length < 2) return question;
  const order = shuffle(question.options.map((_, index) => index));
  const options = order.map((position) => question.options[position]);
  return {
    ...question,
    options,
    answer: order.indexOf(question.answer),
  };
}

/** Builds a long, repeat-free-within-a-block run queue from a deck. */
export function buildQueue(
  deck: Deck,
  size = 60,
  options: { avoidFirstId?: string; randomizeOptions?: boolean } = {},
): Question[] {
  const { avoidFirstId, randomizeOptions = false } = options;
  const queue: Question[] = [];
  let block: Question[] = [];
  while (queue.length < size) {
    if (block.length === 0) {
      block = shuffle(randomizeOptions ? deck.questions.map(randomizeQuestion) : deck.questions);
      if (block.length > 1) {
        const previousId = queue.length > 0 ? queue[queue.length - 1].id : avoidFirstId;
        if (previousId && block[0].id === previousId) {
          [block[0], block[1]] = [block[1], block[0]];
        }
      }
    }
    queue.push(block.shift() as Question);
  }
  return queue;
}
