import { NavLink } from 'react-router-dom'
import { MessagesSquare, Users, User } from 'lucide-react'

const items = [
  { to: '/chats', label: 'Chats', Icon: MessagesSquare },
  { to: '/people', label: 'People', Icon: Users },
  { to: '/profile', label: 'Profile', Icon: User },
]

export default function BottomNav() {
  return (
    <nav className="bottom-nav">
      {items.map(({ to, label, Icon }) => (
        <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'active' : '')}>
          <Icon size={22} />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
