// The API client reads EXPO_PUBLIC_BACKEND_URL at import time and throws when it is missing, which is the point of
// that check; tests need a value that is syntactically a URL but unreachable.
process.env.EXPO_PUBLIC_BACKEND_URL = "http://backend.test";

// AsyncStorage's native module is not there under Jest; this is the mock the library ships for exactly this.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
