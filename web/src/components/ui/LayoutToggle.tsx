import { LayoutGrid, LayoutList } from 'lucide-react'
import SegmentedControl from './SegmentedControl'

interface Props {
  layout: 'list' | 'grid'
  onChange: (l: 'list' | 'grid') => void
}

export default function LayoutToggle({ layout, onChange }: Props) {
  return (
    <SegmentedControl
      label="Layout"
      value={layout}
      onChange={onChange}
      options={[
        { value: 'list', icon: <LayoutList />, title: 'List view' },
        { value: 'grid', icon: <LayoutGrid />, title: 'Grid view' },
      ]}
    />
  )
}
