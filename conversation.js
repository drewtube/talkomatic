module.exports = [
  {
    topic: "General",
    questions: [
      "How are you today?",
      "What did you do over the weekend?",
      "What's your favorite hobby?",
      "Anyone up for a game?",
      "What music are you into?"
    ],
    answers: [
      "I'm good, thanks! How about you?",
      "I had a relaxing weekend. How was yours?",
      "I enjoy reading and hiking. What about you?",
      "I'd love to play! What game do you have in mind?",
      "I love all kinds of music, but rock is my favorite. How about you?"
    ],
    followUps: [
      { question: "How are you today?", response: "I'm good, thanks! How about you?" },
      { question: "What did you do over the weekend?", response: "I had a relaxing weekend. How was yours?" },
      { question: "What's your favorite hobby?", response: "I enjoy reading and hiking. What about you?" },
      { question: "Anyone up for a game?", response: "I'd love to play! What game do you have in mind?" },
      { question: "What music are you into?", response: "I love all kinds of music, but rock is my favorite. How about you?" }
    ]
  },
  {
    topic: "Books",
    questions: [
      "Any good book recommendations?",
      "I just finished a great book!",
      "What's your favorite book?"
    ],
    answers: [
      "I recommend 'The Great Gatsby'. Have you read it?",
      "What was the book about?",
      "My favorite book is 'To Kill a Mockingbird'. What's yours?"
    ],
    followUps: [
      { question: "Any good book recommendations?", response: "I recommend 'The Great Gatsby'. Have you read it?" },
      { question: "I just finished a great book!", response: "What was the book about?" },
      { question: "What's your favorite book?", response: "My favorite book is 'To Kill a Mockingbird'. What's yours?" }
    ]
  },
  {
    topic: "Movies",
    questions: [
      "Let's talk about movies.",
      "What's your favorite movie?",
      "Has anyone seen the latest news?"
    ],
    answers: [
      "I love discussing movies! Have you seen any good ones lately?",
      "My favorite movie is 'Inception'. What's yours?",
      "I haven't seen the latest news. What's happening?"
    ],
    followUps: [
      { question: "Let's talk about movies.", response: "I love discussing movies! Have you seen any good ones lately?" },
      { question: "What's your favorite movie?", response: "My favorite movie is 'Inception'. What's yours?" },
      { question: "Has anyone seen the latest news?", response: "I haven't seen the latest news. What's happening?" }
    ]
  },
  {
    topic: "Food",
    questions: [
      "I enjoy cooking new recipes.",
      "What's your favorite food?",
      "I love traveling! Any good food spots?"
    ],
    answers: [
      "What kind of recipes do you like to cook?",
      "My favorite food is pizza. What's yours?",
      "I love trying new restaurants when I travel. Any recommendations?"
    ],
    followUps: [
      { question: "I enjoy cooking new recipes.", response: "What kind of recipes do you like to cook?" },
      { question: "What's your favorite food?", response: "My favorite food is pizza. What's yours?" },
      { question: "I love traveling! Any good food spots?", response: "I love trying new restaurants when I travel. Any recommendations?" }
    ]
  },
  {
    topic: "Technology",
    questions: [
      "Let's discuss tech trends.",
      "I enjoy coding in JavaScript.",
      "Anyone into fitness?"
    ],
    answers: [
      "What tech trends are you interested in?",
      "I love JavaScript too! What projects are you working on?",
      "I enjoy fitness as well. What's your favorite workout?"
    ],
    followUps: [
      { question: "Let's discuss tech trends.", response: "What tech trends are you interested in?" },
      { question: "I enjoy coding in JavaScript.", response: "I love JavaScript too! What projects are you working on?" },
      { question: "Anyone into fitness?", response: "I enjoy fitness as well. What's your favorite workout?" }
    ]
  },
  {
    topic: "Pets",
    questions: [
      "I just adopted a new pet!",
      "Do you have any pets?",
      "I enjoy painting."
    ],
    answers: [
      "That's great! What kind of pet did you adopt?",
      "I have a dog. Do you have any pets?",
      "Painting is a wonderful hobby. What do you like to paint?"
    ],
    followUps: [
      { question: "I just adopted a new pet!", response: "That's great! What kind of pet did you adopt?" },
      { question: "Do you have any pets?", response: "I have a dog. Do you have any pets?" },
      { question: "I enjoy painting.", response: "Painting is a wonderful hobby. What do you like to paint?" }
    ]
  }
];
