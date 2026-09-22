// Core client behaviour tests (spec.production_hardening.mobile_client_core_behavior_tests_required).
//
// The jest-expo preset supplies the Expo/React Native module mocks; without it, importing anything that reaches
// expo-secure-store or AsyncStorage fails before a single assertion runs.
module.exports = {
  preset: "jest-expo",
  roots: ["<rootDir>/src", "<rootDir>/app"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  clearMocks: true,
};
