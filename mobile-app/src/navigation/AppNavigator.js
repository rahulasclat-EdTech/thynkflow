// mobile-app/src/navigation/AppNavigator.js
import React from 'react'
import { View, Text } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../context/AuthContext'

let LoginScreen, ProfileScreen, LeadsScreen, LeadDetailScreen,
    PostCallScreen, LeadHistoryScreen, FollowUpScreen,
    ReportsScreen, DashboardScreen

const Placeholder = ({ name }) => (
  <View style={{ flex:1, alignItems:'center', justifyContent:'center', backgroundColor:'#F9FAFB' }}>
    <Ionicons name="construct-outline" size={40} color="#9CA3AF" />
    <Text style={{ color:'#6B7280', marginTop:8, fontSize:14 }}>{name} screen coming soon</Text>
  </View>
)

try { LoginScreen       = require('../screens/auth/LoginScreen').default }
catch(e) { LoginScreen  = () => <Placeholder name="Login" /> }

try { ProfileScreen     = require('../screens/auth/ProfileScreen').default }
catch(e) { ProfileScreen = () => <Placeholder name="Profile" /> }

try { DashboardScreen   = require('../screens/dashboard/DashboardScreen').default }
catch(e) { DashboardScreen = () => <Placeholder name="Dashboard" /> }

try { LeadsScreen       = require('../screens/leads/LeadsScreen').default }
catch(e) { LeadsScreen  = () => <Placeholder name="Leads" /> }

try { LeadDetailScreen  = require('../screens/leads/LeadDetailScreen').default }
catch(e) { LeadDetailScreen = () => <Placeholder name="Lead Detail" /> }

try { PostCallScreen    = require('../screens/leads/PostCallScreen').default }
catch(e) { PostCallScreen = () => <Placeholder name="Post Call" /> }

try { LeadHistoryScreen = require('../screens/leads/LeadHistoryScreen').default }
catch(e) { LeadHistoryScreen = () => <Placeholder name="Lead History" /> }

try { FollowUpScreen    = require('../screens/followup/FollowUpScreen').default }
catch(e) { FollowUpScreen = () => <Placeholder name="Follow Ups" /> }

try { ReportsScreen     = require('../screens/reports/ReportsScreen').default }
catch(e) { ReportsScreen = () => <Placeholder name="Reports" /> }

const Tab   = createBottomTabNavigator()
const Stack = createNativeStackNavigator()

function LeadsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="LeadsList"   component={LeadsScreen} />
      <Stack.Screen name="LeadDetail"  component={LeadDetailScreen} />
      <Stack.Screen name="PostCall"    component={PostCallScreen} />
      <Stack.Screen name="LeadHistory" component={LeadHistoryScreen} />
    </Stack.Navigator>
  )
}

function MainTabs() {
  const INDIGO = '#4F46E5'
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: INDIGO,
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: { paddingBottom: 6, paddingTop: 4, height: 60 },
        tabBarIcon: ({ focused, color, size }) => {
          const icons = {
            Dashboard: focused ? 'grid'          : 'grid-outline',
            Leads:     focused ? 'people'        : 'people-outline',
            FollowUps: focused ? 'alarm'         : 'alarm-outline',
            Reports:   focused ? 'bar-chart'     : 'bar-chart-outline',
            Profile:   focused ? 'person-circle' : 'person-circle-outline',
          }
          return <Ionicons name={icons[route.name] || 'ellipse-outline'} size={size} color={color} />
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
        {user
          ? <Stack.Screen name="Main"  component={MainTabs} />
          : <Stack.Screen name="Login" component={LoginScreen} />
        }
      </Stack.Navigator>
    </NavigationContainer>
  )
}
