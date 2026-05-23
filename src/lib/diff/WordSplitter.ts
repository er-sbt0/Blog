import Mode from "./Mode";
import * as Utils from "./Utils";

type State = {
  mode: number;
  currentWord: string[];
  words: string[];
};

function convertHtmlToListOfWords(text: string, _blockExpressions: RegExp[]) {
  let state: State = {
    mode: Mode.character,
    currentWord: [],
    words: [],
  };

  for (let i = 0; i < text.length; i++) {
    const character = text[i];

    switch (state.mode) {
      case Mode.character:
        if (Utils.isStartOfTag(character)) {
          addClearWordSwitchMode(state, "<", Mode.tag);
        } else if (Utils.isStartOfEntity(character)) {
          addClearWordSwitchMode(state, character, Mode.entity);
        } else if (Utils.isWhiteSpace(character)) {
          addClearWordSwitchMode(state, character, Mode.whitespace);
        } else if (
          Utils.isWord(character) &&
          (state.currentWord.length === 0 ||
            Utils.isWord(
              state.currentWord[state.currentWord.length - 1],
            ))
        ) {
          state.currentWord.push(character);
        } else {
          addClearWordSwitchMode(state, character, Mode.character);
        }

        break;

      case Mode.tag:
        if (Utils.isEndOfTag(character)) {
          state.currentWord.push(character);
          state.words.push(state.currentWord.join(""));

          state.currentWord = [];
          state.mode = Utils.isWhiteSpace(character)
            ? Mode.whitespace
            : Mode.character;
        } else {
          state.currentWord.push(character);
        }

        break;

      case Mode.whitespace:
        if (Utils.isStartOfTag(character)) {
          addClearWordSwitchMode(state, character, Mode.tag);
        } else if (Utils.isStartOfEntity(character)) {
          addClearWordSwitchMode(state, character, Mode.entity);
        } else if (Utils.isWhiteSpace(character)) {
          state.currentWord.push(character);
        } else {
          addClearWordSwitchMode(state, character, Mode.character);
        }

        break;

      case Mode.entity:
        if (Utils.isStartOfTag(character)) {
          addClearWordSwitchMode(state, character, Mode.tag);
        } else if (Utils.isWhiteSpace(character)) {
          addClearWordSwitchMode(state, character, Mode.whitespace);
        } else if (Utils.isEndOfEntity(character)) {
          let switchToNextMode = true;
          if (state.currentWord.length !== 0) {
            state.currentWord.push(character);
            state.words.push(state.currentWord.join(""));

            //join &nbsp; entity with last whitespace
            if (
              state.words.length > 2 &&
              Utils.isWhiteSpace(
                state.words[state.words.length - 2],
              ) &&
              Utils.isWhiteSpace(
                state.words[state.words.length - 1],
              )
            ) {
              let w1 = state.words[state.words.length - 2];
              let w2 = state.words[state.words.length - 1];
              state.words.splice(state.words.length - 2, 2);
              state.currentWord = [w1, w2];
              state.mode = Mode.whitespace;
              switchToNextMode = false;
            }
          }

          if (switchToNextMode) {
            state.currentWord = [];
            state.mode = Mode.character;
          }
        } else if (Utils.isWord(character)) {
          state.currentWord.push(character);
        } else {
          addClearWordSwitchMode(state, character, Mode.character);
        }

        break;
    }
  }

  if (state.currentWord.length !== 0) {
    state.words.push(state.currentWord.join(""));
  }

  return state.words;
}

function addClearWordSwitchMode(state: State, character: string, mode: Mode) {
  if (state.currentWord.length !== 0) {
    state.words.push(state.currentWord.join(""));
  }

  state.currentWord = [character];
  state.mode = mode;
}

export { convertHtmlToListOfWords };
