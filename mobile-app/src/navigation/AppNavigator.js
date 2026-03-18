// mobile-app/src/navigation/AppNavigator.js
import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../context/AuthContext'

import LoginScreen       from '../screens/auth/LoginScreen'
import ProfileScreen     from '../screens/auth/ProfileScreen'
import LeadsScreen       from '../screens/leads/LeadsScreen'
import LeadDetailScreen  from '../screens/leads/LeadDetailScreen'
import PostCallScreen    from '../screens/leads/PostCallScreen'
import LeadHistoryScreen from '../screens/leads/LeadHistoryScreen'
import FollowUpScreen    from '../screens/followup/FollowUpScreen'
import ReportsScreen     from '../screens/reports/ReportsScreen'
import DashboardScreen   from '../screens/dashboard/DashboardScreen'

const Tab   = createBottomTabNavigator()
const Stack = createNativeStackNavigator()

function LeadsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="LeadsList"    component={LeadsScreen} />
      <Stack.Screen name="LeadDetail"   component={LeadDetailScreen} />
      <Stack.Screen name="PostCall"     component={PostCallScreen} />
      <Stack.Screen name="LeadHistory"  component={LeadHistoryScreen} />
    </Stack.Navigator>
  )
}

function MainTabs() {
  const { user } = useAuth()
  const isAdmin  = user?.role_name === 'admin'
  const INDIGO   = '#4F46E5'

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: INDIGO,
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: { paddingBottom: 6, paddingTop: 4, height: 60 },
        tabBarIcon: ({ focused, color, size }) => {
          const icons = {
            Dashboard: focused ? 'grid'           : 'grid-outline',
            Leads:     focused ? 'people'         : 'people-outline',
            FollowUps: focused ? 'alarm'          : 'alarm-outline',
            Reports:   focused ? 'bar-chart'      : 'bar-chart-outline',
            Profile:   focused ? 'person-circle'  : 'person-circle-outline',
          }
          return <Ionicons name={icons[route.name] || 'ellipse'} size={size} color={color} />
        },
      })}>
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Leads"     component={LeadsStack} />
      <Tab.Screen name="FollowUps" component={FollowUpScreen} options={{ title: 'Follow-ups' }} />
      <Tab.Screen name="Reports"   component={ReportsScreen} />
      <Tab.Screen name="Profile"   component={ProfileScreen} />
    </Tab.Navigator>
  )
}

export default function AppNavigator() {
  const { user } = useAuth()
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <Stack.Screen name="Main" component={MainTabs} />
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  )
}
