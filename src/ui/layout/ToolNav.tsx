'use client'

import Box from '@mui/material/Box'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import Link from 'next/link'

import type { ToolDefinition } from './toolRegistry'
import { m3, m3Shape } from '../theme/m3Tokens'

/**
 * Danh sách công cụ, vẽ theo hai hướng.
 *
 *   column  cột dọc bên trái, dùng từ md trở lên
 *   row     dải ngang cuộn được, dùng khi màn hình hẹp
 *
 * Cùng một dữ liệu, cùng một quy tắc "đang mở thì gạch màu ở cạnh" — chỉ khác
 * cạnh nào. Tách ra khỏi AppShell vì phần đánh dấu mục đang mở là thứ duy nhất
 * có logic ở đây, và nó không nên nằm lẫn với phần dựng khung.
 */
export interface ToolNavProps {
  tools: readonly ToolDefinition[]
  pathname: string
  direction: 'column' | 'row'
}

export const isToolActive = (tool: ToolDefinition, pathname: string): boolean =>
  pathname === tool.href || pathname.startsWith(`${tool.href}/`)

export function ToolNav({ tools, pathname, direction }: ToolNavProps) {
  const vertical = direction === 'column'

  return (
    <Box
      component="ul"
      sx={{
        listStyle: 'none',
        m: 0,
        p: 0,
        display: 'flex',
        flexDirection: direction,
        gap: vertical ? 0.5 : 1,
        overflowX: vertical ? 'visible' : 'auto',
        scrollbarWidth: 'none',
        '&::-webkit-scrollbar': { display: 'none' },
      }}
    >
      {tools.map((tool) => {
        const active = isToolActive(tool, pathname)
        const planned = tool.status === 'planned'
        const Icon = tool.icon

        // Cạnh màu: bên trái khi xếp dọc, bên dưới khi xếp ngang. Đây là dấu
        // hiệu duy nhất của mục đang mở ngoài màu nền, nên nó phải dày hơn viền
        // thường (2px) mới thấy được.
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
              transition: 'background-color 120ms ease, color 120ms ease, border-color 120ms ease',
              '&:hover': planned
                ? undefined
                : { color: m3('onSurface'), backgroundColor: m3('surfaceContainerLow') },
            }}
          >
            <Icon fontSize="small" sx={{ flex: 'none', fontSize: 18 }} />
            <Typography variant="body2" sx={{ fontWeight: active ? 600 : 400, minWidth: 0 }} noWrap>
              {tool.label}
            </Typography>
          </Box>
        )

        return (
          <Box component="li" key={tool.id} sx={{ minWidth: 0 }}>
            <Tooltip title={tool.description} placement={vertical ? 'right' : 'bottom'}>
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
  )
}
