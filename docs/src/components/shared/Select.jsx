import { mdiChevronDown, mdiChevronUp } from '@mdi/js'
import Icon from '@mdi/react'
import React, { useEffect, useState } from 'react'

export const Select = (props) => {
	const { defaultValue, onSelect, options } = props
	const [isSelectOpen, setSelectOpen] = useState(false)
	const [value, setValue] = useState(defaultValue ?? options[0])

	useEffect(() => {
		setValue(defaultValue ?? options[0])
	}, [defaultValue, options])

	const onClickOption = (value) => () => {
		setValue(value)
		onSelect(value)
		setSelectOpen(false)
	}
	const onToggleSelect = () => {
		setSelectOpen(!isSelectOpen)
	}

	return (
		<div className="select-container">
			<button className={'select-row'} onClick={onToggleSelect}>
				<span className="select-text no-margin">{value.label}</span>
				<Icon path={isSelectOpen ? mdiChevronUp : mdiChevronDown} size={'16px'} color={'rgb(161, 161, 161)'} />
			</button>
			{isSelectOpen && (
				<menu className={'select-menu'}>
					{options.map((item) => (
						<button key={item.value} className={item.value === value.value ? 'select-menu-active' : undefined} onClick={onClickOption(item)}>
							{item.label}
						</button>
					))}
				</menu>
			)}
		</div>
	)
}
