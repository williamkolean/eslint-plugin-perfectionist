import type { SortingNode } from '../typings'

import { isPartitionComment } from '../utils/is-partition-comment'
import { createEslintRule } from '../utils/create-eslint-rule'
import { getCommentBefore } from '../utils/get-comment-before'
import { getSourceCode } from '../utils/get-source-code'
import { toSingleLine } from '../utils/to-single-line'
import { rangeToDiff } from '../utils/range-to-diff'
import { isPositive } from '../utils/is-positive'
import { sortNodes } from '../utils/sort-nodes'
import { makeFixes } from '../utils/make-fixes'
import { complete } from '../utils/complete'
import { pairwise } from '../utils/pairwise'
import { compare } from '../utils/compare'

type MESSAGE_ID = 'unexpectedEnumsOrder'

type Options = [
  Partial<{
    type: 'alphabetical' | 'line-length' | 'natural'
    partitionByComment: string[] | boolean | string
    order: 'desc' | 'asc'
    ignoreCase: boolean
  }>,
]

export default createEslintRule<Options, MESSAGE_ID>({
  name: 'sort-enums',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce sorted TypeScript enums.',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          type: {
            description: 'Specifies the sorting method.',
            type: 'string',
            enum: ['alphabetical', 'natural', 'line-length'],
          },
          order: {
            description:
              'Determines whether the sorted items should be in ascending or descending order.',
            type: 'string',
            enum: ['asc', 'desc'],
          },
          ignoreCase: {
            description:
              'Controls whether sorting should be case-sensitive or not.',
            type: 'boolean',
          },
          partitionByComment: {
            description:
              'Allows you to use comments to separate the class members into logical groups.',
            anyOf: [
              {
                type: 'array',
                items: {
                  type: 'string',
                },
              },
              {
                type: 'boolean',
              },
              {
                type: 'string',
              },
            ],
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      unexpectedEnumsOrder: 'Expected "{{right}}" to come before "{{left}}".',
    },
  },
  defaultOptions: [
    {
      type: 'alphabetical',
      order: 'asc',
      ignoreCase: true,
      partitionByComment: false,
    },
  ],
  create: context => ({
    TSEnumDeclaration: node => {
      if (
        node.members.length > 1 &&
        node.members.every(({ initializer }) => initializer)
      ) {
        let options = complete(context.options.at(0), {
          partitionByComment: false,
          type: 'alphabetical',
          ignoreCase: true,
          order: 'asc',
        } as const)

        let sourceCode = getSourceCode(context)
        let partitionComment = options.partitionByComment

        let formattedMembers: SortingNode[][] = node.members.reduce(
          (accumulator: SortingNode[][], member) => {
            let comment = getCommentBefore(member, sourceCode)

            if (
              partitionComment &&
              comment &&
              isPartitionComment(partitionComment, comment.value)
            ) {
              accumulator.push([])
            }

            let name =
              member.id.type === 'Literal'
                ? `${member.id.value}`
                : `${sourceCode.text.slice(...member.id.range)}`

            let sortingNode = {
              name,
              node: member,
              size: rangeToDiff(member.range),
            }
            accumulator.at(-1)!.push(sortingNode)
            return accumulator
          },
          [[]],
        )

        for (let nodes of formattedMembers) {
          pairwise(nodes, (left, right) => {
            if (isPositive(compare(left, right, options))) {
              context.report({
                messageId: 'unexpectedEnumsOrder',
                data: {
                  left: toSingleLine(left.name),
                  right: toSingleLine(right.name),
                },
                node: right.node,
                fix: fixer =>
                  makeFixes(
                    fixer,
                    nodes,
                    sortNodes(nodes, options),
                    sourceCode,
                    { partitionComment },
                  ),
              })
            }
          })
        }
      }
    },
  }),
})
