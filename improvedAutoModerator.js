// improvedAutoModerator.js

const natural = require('natural');
const stringSimilarity = require('string-similarity');

class ImprovedAutoModerator {
    constructor(offensiveWords) {
        this.offensiveWords = new Set(offensiveWords.map(word => word.toLowerCase()));
        this.tokenizer = new natural.WordTokenizer();
        this.stemmer = natural.PorterStemmer;
    }

    checkMessage(message) {
        const normalizedMessage = this.normalizeText(message);
        
        if (this.containsOffensiveWords(normalizedMessage) ||
            this.containsSpacedOutOffensiveWords(normalizedMessage) ||
            this.containsLeetspeakOffensiveWords(normalizedMessage)) {
            return true;
        }

        return false;
    }

    normalizeText(text) {
        return text.toLowerCase().replace(/[^\w\s]/g, '');
    }

    containsOffensiveWords(text) {
        const tokens = this.tokenizer.tokenize(text);
        for (let token of tokens) {
            const stemmedToken = this.stemmer.stem(token);
            if (this.offensiveWords.has(stemmedToken) || this.isSimilarToOffensiveWord(stemmedToken)) {
                return true;
            }
        }
        return false;
    }

    isSimilarToOffensiveWord(token) {
        for (let offensiveWord of this.offensiveWords) {
            if (stringSimilarity.compareTwoStrings(token, offensiveWord) > 0.8) {
                return true;
            }
        }
        return false;
    }

    containsSpacedOutOffensiveWords(message) {
        const noSpaceMessage = message.replace(/\s/g, '');
        return this.containsOffensiveWords(noSpaceMessage);
    }

    containsLeetspeakOffensiveWords(message) {
        const leetMessage = this.convertFromLeetspeak(message);
        return this.containsOffensiveWords(leetMessage);
    }

    convertFromLeetspeak(text) {
        const leetMap = {
            '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't',
            '@': 'a', '$': 's', '!': 'i'
        };
        return text.replace(/[0134578@$!]/g, char => leetMap[char] || char);
    }

    checkURL(url) {
        // Implement URL checking logic here
        // This could involve checking against a list of known malicious domains,
        // or using an external API for URL reputation checking
        return false; // Placeholder return, replace with actual logic
    }
}

module.exports = ImprovedAutoModerator;