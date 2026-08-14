import type { Method, Problem } from "../types";

/**
 * 计算本地数据的“最新变更时间”：题目与方法的 createdAt / updatedAt 最大值。
 * 供局域网设备同步与本地自动备份判断“本地是否比上次同步更新”。
 */
export function localStateTime(problems: Problem[], methods: Method[]): number {
  let max = 0;
  for (const p of problems) {
    max = Math.max(max, p.createdAt || 0, p.updatedAt || 0);
  }
  for (const m of methods) {
    max = Math.max(max, m.createdAt || 0, m.updatedAt || 0);
  }
  return max;
}
