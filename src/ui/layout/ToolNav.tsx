'use client'

import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import Box from '@mui/material/Box'
import Collapse from '@mui/material/Collapse'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import Link from 'next/link'
import { useState } from 'react'

import type { ToolDefinition, ToolGroup } from './toolRegistry'
import { m3, m3Mono, m3Shape } from '../theme/m3Tokens'

/**
 * Danh sách công cụ chia theo khối, gập mở được, vẽ theo hai hướng.
 *
 *   column  cột dọc bên trái, dùng từ md trở lên
 *   row     dải ngang cuộn được, dùng khi màn hình hẹp
 *
 * Cùng một dữ liệu, cùng một quy tắc "đang mở thì gạch màu ở cạnh" — chỉ khác
 * cạnh nào. Tên khối cũng đi theo hướng đó: nằm trên danh sách khi xếp dọc,
 * nằm trước danh sách khi xếp ngang. Tách ra khỏi AppShell vì phần đánh dấu mục
 * đang mở là thứ duy nhất có logic ở đây, và nó không nên nằm lẫn với phần dựng
 * khung.
 *
 * Một công cụ phục vụ hai khối sẽ hiện ở cả hai nhóm, và khi nó đang mở thì cả
 * hai bản đều được đánh dấu. Đó là chủ ý: người dùng đọc được "công cụ này
 * thuộc về cả hai bên", chứ không phải một bản thật và một bản giả.
 */
export interface ToolNavProps {
  groups: readonly ToolGroup[]
  pathname: string
  direction: 'column' | 'row'
}

export const isToolActive = (tool: ToolDefinition, pathname: string): boolean =>
  pathname === tool.href || pathname.startsWith(`${tool.href}/`)

const hasActiveTool = (group: ToolGroup, pathname: string): boolean =>
  group.tools.some((tool) => isToolActive(tool, pathname))

export function ToolNav({ groups, pathname, direction }: ToolNavProps) {
  const vertical = direction === 'column'

  // Chỉ giữ những khối người dùng đã tự bấm. Khối chưa bấm thì mở hay gập là do
  // đường dẫn hiện tại quyết định — nhờ vậy đi tới đâu khối đó tự bung ra, và
  // danh sách vẫn gọn vì các khối còn lại nằm im. Một khi đã bấm thì ý người
  // dùng thắng, kể cả khi họ gập đúng khối đang mở.
  const [toggled, setToggled] = useState<Readonly<Record<string, boolean>>>({})

  const toggle = (id: string, open: boolean) =>
    setToggled((previous) => ({ ...previous, [id]: !open }))

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: direction,
        alignItems: vertical ? 'stretch' : 'center',
        gap: vertical ? 3 : 2,
        overflowX: vertical ? 'visible' : 'auto',
        scrollbarWidth: 'none',
        '&::-webkit-scrollbar': { display: 'none' },
      }}
    >
      {groups.map((group) => {
        const headingId = `tool-group-${group.audience.id}`
        const listId = `${headingId}-list`
        const reserved = group.tools.length === 0
        const open = toggled[group.audience.id] ?? hasActiveTool(group, pathname)

        const label = (
          <Typography
            component="span"
            sx={{ ...m3Mono.columnHeader, whiteSpace: 'nowrap', minWidth: 0 }}
            noWrap
          >
            {group.audience.label}
          </Typography>
        )

        // Khối để dành chỉ là một dòng chữ: không có gì để gập, và một nút bấm
        // vào không ra gì thì tệ hơn là không có nút.
        const heading = reserved ? (
          <Box
            id={headingId}
            sx={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 2,
              px: 3,
              color: m3('onSurfaceVariant'),
              opacity: 0.42,
              minWidth: 0,
            }}
          >
            {label}
            <Typography variant="caption" sx={{ whiteSpace: 'nowrap' }}>
              chưa có công cụ
            </Typography>
          </Box>
        ) : (
          <Box
            component="button"
            type="button"
            id={headingId}
            onClick={() => toggle(group.audience.id, open)}
            aria-expanded={open}
            aria-controls={listId}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              px: 3,
              py: 1,
              width: vertical ? '100%' : 'auto',
              minWidth: 0,
              appearance: 'none',
              border: 'none',
              borderRadius: `${m3Shape.small}px`,
              background: 'none',
              font: 'inherit',
              textAlign: 'left',
              cursor: 'pointer',
              color: m3('onSurfaceVariant'),
              transition: 'color 120ms ease, background-color 120ms ease',
              '&:hover': { color: m3('onSurface'), backgroundColor: m3('surfaceContainerLow') },
            }}
          >
            <ExpandMoreIcon
              sx={{
                flex: 'none',
                fontSize: 16,
                transform: open ? 'none' : 'rotate(-90deg)',
                transition: 'transform 120ms ease',
              }}
            />
            {label}
          </Box>
        )

        return (
          <Box
            key={group.audience.id}
            sx={{
              display: 'flex',
              flexDirection: direction,
              alignItems: vertical ? 'stretch' : 'center',
              gap: vertical ? 1 : 1.5,
              minWidth: 0,
            }}
          >
            <Tooltip title={group.audience.description} placement={vertical ? 'right' : 'bottom'}>
              {heading}
            </Tooltip>

            {reserved ? null : (
              <Collapse
                id={listId}
                in={open}
                orientation={vertical ? 'vertical' : 'horizontal'}
                sx={{ minWidth: 0 }}
              >
                <Box
                  component="ul"
                  aria-labelledby={headingId}
                  sx={{
                    listStyle: 'none',
                    m: 0,
                    p: 0,
                    display: 'flex',
                    flexDirection: direction,
                    gap: vertical ? 0.5 : 1,
                    minWidth: 0,
                  }}
                >
                  {group.tools.map((tool) => {
                    const active = isToolActive(tool, pathname)
                    const planned = tool.status === 'planned'
                    const Icon = tool.icon

                    // Cạnh màu: bên trái khi xếp dọc, bên dưới khi xếp ngang. Đây
                    // là dấu hiệu duy nhất của mục đang mở ngoài màu nền, nên nó
                    // phải dày hơn viền thường (2px) mới thấy được.
                    const edge = vertical
                      ? { borderLeft: `2px solid ${active ? m3('primary') : m3('outlineVariant')}` }
                      : { borderBottom: `2px solid ${active ? m3('primary') : 'transparent'}` }

                    const content = (
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 2.5,
                          px: 3,
                          py: 2.5,
                          minWidth: 0,
                          whiteSpace: 'nowrap',
                          cursor: planned ? 'not-allowed' : 'pointer',
                          opacity: planned ? 0.42 : 1,
                          color: active ? m3('onSurface') : m3('onSurfaceVariant'),
                          backgroundColor: active ? m3('surfaceContainerLow') : 'transparent',
                          borderRadius: vertical
                            ? `0 ${m3Shape.small}px ${m3Shape.small}px 0`
                            : `${m3Shape.small}px ${m3Shape.small}px 0 0`,
                          ...edge,
                          transition:
                            'background-color 120ms ease, color 120ms ease, border-color 120ms ease',
                          '&:hover': planned
                            ? undefined
                            : {
                                color: m3('onSurface'),
                                backgroundColor: m3('surfaceContainerLow'),
                              },
                        }}
                      >
                        <Icon fontSize="small" sx={{ flex: 'none', fontSize: 18 }} />
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: active ? 600 : 400, minWidth: 0 }}
                          noWrap
                        >
                          {tool.label}
                        </Typography>
                      </Box>
                    )

                    return (
                      <Box component="li" key={tool.id} sx={{ minWidth: 0 }}>
                        <Tooltip
                          title={tool.description}
                          placement={vertical ? 'right' : 'bottom'}
                        >
                          {planned ? (
                            <Box aria-disabled>{content}</Box>
                          ) : (
                            <Box
                              component={Link}
                              href={tool.href}
                              aria-current={active ? 'page' : undefined}
                              sx={{ textDecoration: 'none', display: 'block' }}
                            >
                              {content}
                            </Box>
                          )}
                        </Tooltip>
                      </Box>
                    )
                  })}
                </Box>
              </Collapse>
            )}
          </Box>
        )
      })}
    </Box>
  )
}
