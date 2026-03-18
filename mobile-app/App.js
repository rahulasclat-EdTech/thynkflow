import React from 'react'
import { View, Text } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider } from './src/context/AuthContext'
import AppNavigator from './src/navigation/AppNavigator'

class ErrorBoundary extends React.Component {
  state = { error: null }
  componentDidCatch(error) { this.setState({ error }) }
  render() {
    if (this.state.error) return (
      <View style={{ flex:1, padding:40, justifyContent:'center', backgroundColor:'#fff' }}>
        <Text style={{ fontSize:16, fontWeight:'bold', color:'red', marginBottom:12 }}>
          App Error — copy this and send to developer:
        </Text>
        <Text style={{ fontSize:12, color:'#333' }}>
          {this.state.error.toString()}
        </Text>
      </View>
    )
    return this.props.children
  }
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ErrorBoundary>
          <StatusBar style="light" />
          <AppNavigator />
        </ErrorBoundary>
      </AuthProvider>
    </SafeAreaProvider>
  )
}
