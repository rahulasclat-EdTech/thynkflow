import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { View, Text, StyleSheet } from 'react-native'
import { useAuth } from '../context/AuthContext'
import { Colors } from '../utils/colors'

import LoginScreen from '../screens/auth/LoginScreen'
import LeadsScreen from '../screens/leads/LeadsScreen'
import LeadHistoryScreen from '../screens/leads/LeadHistoryScreen'
import FollowUpScreen from '../screens/followup/FollowUpScreen'
import ReportsScreen from '../screens/reports/ReportsScreen'
import ProfileScreen from '../screens/auth/ProfileScreen'
import PostCallScreen from '../screens/leads/PostCallScreen'

const Stack = createNativeStackNavigator()
const Tab = createBottomTabNavigator()

function TabIcon({ name, focused }) {
  const icons = { Leads: '👥', 'Follow Up': '📅', Reports: '📊' }
  return (
    <View style={[styles.tabIcon, focused && styles.tabIconActive]}>
      <Text style={styles.tabEmoji}>{icons[name]}</Text>
    </View>
  )
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused }) => <TabIcon name={route.name} focused={focused} />,
        tabBarLabel: ({ focused, color }) => (
          <Text style={[styles.tabLabel, { color: focused ? Colors.primaryLight : Colors.textLight }]}>
            {route.name}
          </Text>
        ),
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: Colors.primaryLight,
        tabBarInactiveTintColor: Colors.textLight,
      })}
    >
      <Tab.Screen name="Leads" component={LeadsStack} />
      <Tab.Screen name="Follow Up" component={FollowUpScreen} />
      <Tab.Screen name="Reports" component={ReportsScreen} />
    </Tab.Navigator>
  )
}

function LeadsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="LeadsList" component={LeadsScreen} />
      <Stack.Screen name="PostCall" component={PostCallScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="LeadHistory" component={LeadHistoryScreen} />
    </Stack.Navigator>
  )
}

export default function AppNavigator() {
  const { user, loading } = useAuth()

  if (loading) return null

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="Profile" component={ProfileScreen} options={{ presentation: 'modal' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  )
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.white,
    borderTopColor: Colors.border,
    borderTopWidth: 1,
    height: 64,
    paddingBottom: 8,
    paddingTop: 4,
  },
  tabIcon: { alignItems: 'center', justifyContent: 'center', width: 32, height: 28 },
  tabIconActive: {},
  tabEmoji: { fontSize: 18 },
  tabLabel: { fontSize: 10, fontWeight: '600', marginTop: 2 },
})
