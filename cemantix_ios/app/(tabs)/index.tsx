import { StyleSheet, SafeAreaView, Platform, StatusBar } from 'react-native';
import { WebView } from 'react-native-webview';

export default function HomeScreen() {
  // L'URL de ton jeu hébergé
  const GAME_URL = 'https://arcadehub.org/static/hub.html'; // Ou index.html selon ta page d'accueil

  return (
    <SafeAreaView style={styles.container}>
      <WebView 
        source={{ uri: GAME_URL }}
        style={styles.webview}
        // Active le JS (crucial pour ton jeu)
        javaScriptEnabled={true}
        // Permet le stockage local (cookies, session)
        domStorageEnabled={true}
        // Empêche le zoom excessif si le viewport est mal configuré
        scalesPageToFit={Platform.OS === 'android' ? false : true}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000', // Noir pour matcher ton style CSS sombre
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});